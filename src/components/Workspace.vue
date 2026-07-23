<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSessionStore } from '../stores/session'
import { usePolling } from '../composables/usePolling'
import {
  chatWithStepFun,
  formatStepFunError,
  type StepFunImageInput,
  type StepFunMessage,
} from '../composables/useStepFun'
import { getSystemPrompt } from '../composables/useSystemPrompts'
import { markdownToHtml, sanitize } from '../composables/useSanitize'
import { detectCreateCommand, detectStatusCommand, detectStopCommand, detectStartCommand } from '../composables/useMockGitHub'
import { smartTriage, type TriageResult } from '../composables/useTriage'
import { createIssue, createIssueComment, getIssue, updateIssue, getLatestAppVersion } from '../composables/useGitHubAPI'
import ChatInput from './ChatInput.vue'
import type { BuildIssue, ChatSession } from '../types/app'
import {
  Dna, Smartphone, MessageSquare, PanelLeft,
  Gamepad, FileText, Calculator, Settings,
  CircleCheckBig, ClipboardList, Hammer,
  RefreshCw, Key, Search, Star, Sparkles, Wand2, X,
} from '@lucide/vue'
import { REPO_FULL_NAME, userRepoFullName } from '../config/repo'

const emit = defineEmits<{
  (e: 'navigate', view: 'setup' | 'gallery' | 'workspace'): void
}>()

const authStore = useAuthStore()
const sessionStore = useSessionStore()
const { start, stopAll } = usePolling()

const inputText = ref('')
const building = ref(false)
const activeIssue = ref<BuildIssue | null>(null)
const buildProgress = ref<{ step: number; label: string; issueNumber?: number } | null>(null)
const pollingPaused = ref(false)
const failedTriggerIssueNumber = ref<number | null>(null)
const thinking = ref(false)
const stepToken = ref('')
const clarifying = ref(false)
const clarifyingMsg = ref('')
const pendingBuildContext = ref('')
const lastErrorKind = ref<'quota' | 'auth' | 'network' | 'server' | 'unknown' | null>(null)
const retryHasAttachments = ref(false)
const confirmingPlatform = ref(false)
const confirmingPlatformTimer = ref<ReturnType<typeof setTimeout> | null>(null)
interface ChatSubmission {
  text: string
  images: StepFunImageInput[]
}

interface PendingTask {
  triage: TriageResult
  text: string
  description: string
  appName: string
  imageCount: number
}

const pendingTask = ref<PendingTask | null>(null)
const failedCreateTask = ref<PendingTask | null>(null)
const confirmingTask = ref(false)
const taskConfirmationRef = ref<HTMLElement | null>(null)
const chatInputRef = ref<{ clearImages: () => void } | null>(null)
const pendingAppNameValid = computed(() => {
  if (!pendingTask.value || pendingTask.value.triage.scenario === 'platform') return true
  return /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(pendingTask.value.appName)
})
const pendingTaskLabel = computed(() => {
  if (!pendingTask.value) return ''
  if (pendingTask.value.triage.scenario === 'platform') return '平台优化'
  if (pendingTask.value.triage.scenario === 'app_iterate') return '迭代应用'
  return '创建应用'
})
watch(pendingTask, (task) => {
  if (task) void nextTick(() => taskConfirmationRef.value?.focus())
}, { flush: 'post' })
const sidebarOpen = ref(false)
const sessionSearch = ref('')
const collapsedGroups = ref<Record<'quick' | 'platform' | 'apps' | 'closed', boolean>>({
  quick: false,
  platform: false,
  apps: false,
  closed: true,
})
const expandedAppGroups = ref<Record<string, boolean>>({})

function toggleSessionGroup(group: keyof typeof collapsedGroups.value) {
  collapsedGroups.value[group] = !collapsedGroups.value[group]
  try {
    localStorage.setItem('mitosis_sidebar_groups', JSON.stringify(collapsedGroups.value))
  } catch {
    // Persistence is optional; the sidebar remains usable when storage is unavailable.
  }
}

function isSessionGroupCollapsed(group: keyof typeof collapsedGroups.value): boolean {
  return collapsedGroups.value[group]
}

function toggleAppGroup(appName: string) {
  expandedAppGroups.value[appName] = !expandedAppGroups.value[appName]
}

function isAppGroupExpanded(appName: string): boolean {
  return expandedAppGroups.value[appName] ?? false
}

// 恢复持久化的构建进度
onMounted(() => {
  try {
    const savedGroups = JSON.parse(localStorage.getItem('mitosis_sidebar_groups') || '{}')
    for (const group of ['quick', 'platform', 'apps', 'closed'] as const) {
      if (typeof savedGroups?.[group] === 'boolean') collapsedGroups.value[group] = savedGroups[group]
    }
  } catch {
    // Ignore malformed or unavailable local UI preferences.
  }
  const restored = restoreBuildProgress()
  if (restored) {
    buildProgress.value = restored
  }
})

/**
 * 格式化用户可见的错误消息
 * - 提取 HTTP 状态码
 * - 移除原始 JSON/API 响应体
 * - 提供用户友好的中文提示
 * - 不把原始 API 响应或用户内容写入 console
 */
function formatUserError(err: unknown): string {
  const e = err instanceof Error ? err : new Error('未知错误')
  const statusMatch = e.message.match(/(\d{3})/)
  const status = statusMatch?.[1]

  // 已知状态码映射
  if (status === '401') return '认证失败：Token 无效或已过期，请前往 Setup 页面更新。'
  if (status === '403') return '权限不足：当前 Token 无权访问该资源，请检查仓库权限。'
  if (status === '404') return '资源未找到：请求的资源不存在，请检查后重试。'
  if (status === '429') return '请求过于频繁：GitHub API 限流，请稍后再试。'
  if (status === '500') return 'GitHub 服务暂时不可用，请稍后重试。'
  if (status === '502') return 'GitHub 服务暂时不可用，请稍后重试。'
  if (status === '503') return 'GitHub 服务暂时不可用，请稍后重试。'

  // 网络错误
  if (/failed to fetch|networkerror|network\s*error|timeout|cors|typeerror/i.test(e.message)) {
    return '网络连接失败，请检查网络后重试。'
  }

  // 未知错误：只取第一行，避免暴露 JSON 堆栈
  const firstLine = e.message.split('\n')[0].trim()
  if (firstLine.length > 100) {
    return '操作失败，请稍后重试或联系支持。'
  }
  return `操作失败：${firstLine}`
}

// Map store messages to template shape
const displayMessages = computed(() =>
  sessionStore.messages.map(m => ({
    role: m.role,
    text: m.sanitized ? m.content : markdownToHtml(m.content),
    time: new Date(m.createdAt).toLocaleTimeString(),
  }))
)

// 按 app name 聚类的会话组（每个 app 只显示最新的一条）
interface AppGroup {
  appName: string
  sessions: ChatSession[]
  latest: ChatSession
}

// 平台会话（open only）
const platformSessions = computed<ChatSession[]>(() => {
  return sessionStore.groupedSessions.platform.filter(s => s.status !== 'closed')
})

// 最近关闭的会话（最多 5 条）
const recentClosedSessions = computed<ChatSession[]>(() => {
  return sessionStore.sortedSessions
    .filter(s => s.status === 'closed')
    .slice(0, 5)
})

// 快捷访问：最近有更新的应用（排除当前活跃应用）
const quickAccessApps = computed<AppGroup[]>(() => {
  const activeApp = sessionStore.activeSession?.appLabel?.replace('app/', '')
  const appSessions = sessionStore.groupedSessions.app
    .filter(s => s.appLabel?.replace('app/', '') !== activeApp)
  const groups = new Map<string, ChatSession[]>()
  for (const s of appSessions) {
    const name = s.appLabel?.replace('app/', '') || s.title.replace(/^build:\s*/i, '').split(' ')[0] || 'unknown'
    const existing = groups.get(name) || []
    existing.push(s)
    groups.set(name, existing)
  }
  return Array.from(groups.entries())
    .map(([appName, sessions]) => ({
      appName,
      sessions,
      latest: sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    }))
    .sort((a, b) => new Date(b.latest.updatedAt).getTime() - new Date(a.latest.updatedAt).getTime())
    .slice(0, 5)
})

// 应用会话聚类：保留进行中和已完成历史，方便按应用追溯全部迭代。
const clusteredAppGroups = computed<AppGroup[]>(() => {
  const appSessions = sessionStore.groupedSessions.app
  const groups = new Map<string, ChatSession[]>()
  for (const s of appSessions) {
    const name = s.appLabel?.replace('app/', '') || s.title.replace(/^build:\s*/i, '').split(' ')[0] || 'unknown'
    const existing = groups.get(name) || []
    existing.push(s)
    groups.set(name, existing)
  }
  return Array.from(groups.entries())
    .map(([appName, sessions]) => ({
      appName,
      sessions,
      latest: sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    }))
    .sort((a, b) => new Date(b.latest.updatedAt).getTime() - new Date(a.latest.updatedAt).getTime())
})

// 搜索过滤：同时搜索标题和 appLabel
const searchResults = computed<ChatSession[]>(() => {
  const q = sessionSearch.value.trim().toLowerCase()
  if (!q) return []
  return sessionStore.sortedSessions.filter(s => {
    const title = (s.title || '').toLowerCase()
    const app = (s.appLabel || '').toLowerCase().replace('app/', '')
    return title.includes(q) || app.includes(q)
  })
})

// 相对时间格式化
function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小时前`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay} 天前`
  return new Date(dateStr).toLocaleDateString()
}

// 状态样式类
function statusClass(session: ChatSession): string {
  const status = sessionStore.getSessionDisplayStatus(session)
  if (status === '进行中') return 'status-active'
  if (status === '等待审查') return 'status-review'
  if (status === '构建中') return 'status-building-pulse'
  if (status === '构建失败' || status === '已停止') return 'status-error'
  return 'status-closed'
}

// ─── 构建进度持久化 ───────────────────────────────────────
const BP_STORAGE_PREFIX = 'mitosis_build_progress_'
const FAILED_TRIGGER_STORAGE_PREFIX = 'mitosis_failed_trigger_'

function persistBuildProgress(progress: { step: number; label: string; issueNumber?: number } | null) {
  if (typeof window === 'undefined') return
  if (progress?.issueNumber) {
    sessionStorage.setItem(`${BP_STORAGE_PREFIX}${progress.issueNumber}`, JSON.stringify(progress))
  }
}

function clearBuildProgress(issueNumber?: number) {
  if (typeof window === 'undefined') return
  if (issueNumber) {
    sessionStorage.removeItem(`${BP_STORAGE_PREFIX}${issueNumber}`)
  }
}

function persistFailedTrigger(issueNumber: number) {
  if (typeof window !== 'undefined') localStorage.setItem(`${FAILED_TRIGGER_STORAGE_PREFIX}${issueNumber}`, '1')
}

function clearFailedTrigger(issueNumber: number) {
  if (typeof window !== 'undefined') localStorage.removeItem(`${FAILED_TRIGGER_STORAGE_PREFIX}${issueNumber}`)
  if (failedTriggerIssueNumber.value === issueNumber) failedTriggerIssueNumber.value = null
}

function hasPersistedFailedTrigger(issueNumber: number): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(`${FAILED_TRIGGER_STORAGE_PREFIX}${issueNumber}`) === '1'
}

function restoreBuildProgress(): { step: number; label: string; issueNumber: number } | null {
  if (typeof window === 'undefined') return null
  const active = sessionStore.activeSession
  if (!active?.issueNumber) return null
  const raw = sessionStorage.getItem(`${BP_STORAGE_PREFIX}${active.issueNumber}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ─── 分流协议（逻辑在 useTriage composable，与单测共用同一实现）───
const TRIAGE_LABELS: Record<string, string> = {
  chat: '直接回复', build: 'Agent Loop', platform: 'Issue+审核', clarify: '澄清',
}
const INTENT_LABELS: Record<string, string> = {
  question: '询问', create_app: '创建应用', modify_platform: '修改平台', unknown: '未知',
}
const SOURCE_LABELS: Record<string, string> = {
  keyword: '关键词', llm: 'AI 分拣', fallback: '降级',
}

function logTriage(t: TriageResult) {
  const log = `[TRIAGE] 意图: ${INTENT_LABELS[t.intent]} | 决策: ${TRIAGE_LABELS[t.action]}${t.source ? ' | 来源: ' + SOURCE_LABELS[t.source] : ''}${t.basedOn ? ' | based-on: present' : ''}`
  console.log(log)
}

const repo = computed(() => authStore.user?.login ? userRepoFullName(authStore.user.login) : REPO_FULL_NAME)
const isOwner = computed(() => !!authStore.user?.login && authStore.setupComplete)
const chatInputDisabledMessage = computed(() => {
  if (!authStore.token) return '登录状态已失效，请重新完成设置后继续。'
  if (sessionStore.activeSession?.status === 'closed') return '此任务已结束。请新建对话后继续。'
  return ''
})

onMounted(async () => {
  if (typeof window !== 'undefined') {
    // 恢复未持久化的消息（防止页面刷新丢失）
    sessionStore.restoreMessages(sessionStore.activeSession?.issueNumber)

    stepToken.value = sessionStorage.getItem('mitosis_step_token') || ''
    const params = new URLSearchParams(window.location.search)
    const refApp = params.get('ref')
    if (refApp) {
      inputText.value = `我想在 ${refApp} 的基础上继续开发，帮我...`
      window.history.replaceState({}, '', window.location.pathname)
    }
    // RESTful: 从 URL ?session={issueNumber} 恢复会话
    const sessionParam = params.get('session')
    if (sessionParam && authStore.token) {
      const issueNumber = Number(sessionParam)
      if (Number.isInteger(issueNumber)) {
        await sessionStore.loadSessions(authStore.token, repo.value)
        const session = sessionStore.sessions.find(s => s.issueNumber === issueNumber)
        if (session) {
          await loadSession(session, true)
        }
      }
    }
  }
  if (authStore.token) {
    await sessionStore.loadSessions(authStore.token, repo.value)
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

// 移动端侧边栏打开时锁定背景滚动，关闭时恢复滚动位置
const savedScrollY = ref(0)
watch(sidebarOpen, (open) => {
  if (typeof document !== 'undefined') {
    if (open) {
      savedScrollY.value = window.scrollY
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      window.scrollTo(0, savedScrollY.value)
    }
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

function getConversationHistory(): StepFunMessage[] {
  return sessionStore.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gi, '[私钥已隐藏]')
    .replace(/!\[[^\]]*\]\((?:data|blob):[^)]+\)/gi, '[图片已隐藏]')
    .replace(/data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi, '[媒体数据已隐藏]')
    .replace(/blob:[^\s)]+/gi, '[本地链接已隐藏]')
    .replace(/https?:\/\/[^\s)]+/gi, '[外部链接已隐藏]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已隐藏]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号已隐藏]')
    .replace(/\+\d[\d(). -]{7,}\d/g, '[国际电话号码已隐藏]')
    .replace(/((?:phone|telephone|tel|mobile)\s*[:=]\s*)\+?[\d(). -]{7,}\d/gi, '$1[电话号码已隐藏]')
    .replace(/(?<!\d)\d{17}[\dX](?!\d)/gi, '[身份证号已隐藏]')
    .replace(/(?<!\d)(?:\d[ -]?){16,19}(?!\d)/g, '[银行卡号已隐藏]')
    .replace(/((?:客户姓名|客户名|联系人|姓名)\s*[:：]\s*)[^\s,，;；]{2,30}/gi, '$1[姓名已隐藏]')
    .replace(/((?:负责人|客户|联系人|用户姓名)\s*[:：]?\s*)[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹苏潘范彭鲁韦马苗方俞任袁柳史唐薛雷贺倪罗郝安于傅齐康伍余顾孟黄萧尹姚邵汪毛米戴宋熊纪舒项董梁杜阮蓝季贾江郭梅林钟徐邱高夏蔡田樊胡霍万卢莫房程陆翁段白邓武刘龙叶黎易廖阎庄柴牛温聂曾沙关游乔]?[\u4e00-\u9fff]{2,3}/g, '$1[姓名已隐藏]')
    .replace(/(^|[\s|,，:：;；])([赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹苏潘范彭鲁韦马苗方俞任袁柳史唐薛雷贺倪罗郝安于傅齐康伍余顾孟黄萧尹姚邵汪毛米戴宋熊纪舒项董梁杜阮蓝季贾江郭梅林钟徐邱高夏蔡田樊胡霍万卢莫房程陆翁段白邓武刘龙叶黎易廖阎庄柴牛温聂曾沙关游乔][\u4e00-\u9fff]{1,2})(?=$|[\s|,，;；])/gm, '$1[姓名已隐藏]')
    .replace(/((?:收货地址|住址|地址)\s*[:：]\s*)[^\n,，;；]{4,80}/gi, '$1[地址已隐藏]')
    .replace(/((?:full name|customer name|client name|contact name|recipient|name)\s*[:=]\s*)[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}/g, '$1[姓名已隐藏]')
    .replace(/((?:请问|客户|联系人)\s+)[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}(?=\s+(?:联系电话|电话|地址|phone|tel|address))/g, '$1[姓名已隐藏]')
    .replace(/((?:my name is|i am|i'm|the user is|user is|contact is|customer is)\s+)[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}/gi, '$1[姓名已隐藏]')
    .replace(/((?:我叫|我的名字是|联系人是|客户是)\s*)[\u4e00-\u9fff]{2,4}/g, '$1[姓名已隐藏]')
    .replace(/((?:shipping address|street address|mailing address|address)\s*[:=]\s*)[^\n,;]{5,120}/gi, '$1[地址已隐藏]')
    .replace(/\b\d{1,6}\s+[A-Za-z0-9.' -]{2,50}\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi, '[地址已隐藏]')
    .replace(/(?:gh[oprsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})/g, '[凭据已隐藏]')
    .replace(/(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/g, '[云凭据已隐藏]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[JWT 已隐藏]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[凭据已隐藏]')
    .replace(/((?:token|password|passwd|secret|api[_-]?key|access[_-]?key)\s*[:=]\s*["']?)[^\s"']{8,}/gi, '$1[凭据已隐藏]')
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1[凭据已隐藏]')
    .trim()
    .slice(0, 1200)
}

function hasSensitiveContent(value: string): boolean {
  return [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /(?:gh[oprsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
    /(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,})/,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?<!\d)1[3-9]\d{9}(?!\d)/,
    /\+\d[\d(). -]{7,}\d/,
    /(?:phone|telephone|tel|mobile)\s*[:=]\s*\+?[\d(). -]{7,}\d/i,
    /(?<!\d)\d{17}[\dX](?!\d)/i,
    /(?<!\d)(?:\d[ -]?){16,19}(?!\d)/,
    /(?:客户姓名|客户名|联系人|姓名)\s*[:：]\s*[^\s,，;；]{2,30}/i,
    /(?:负责人|客户|联系人|用户姓名)\s*[:：]\s*[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹苏潘范彭鲁韦马苗方俞任袁柳史唐薛雷贺倪罗郝安于傅齐康伍余顾孟黄萧尹姚邵汪毛米戴宋熊纪舒项董梁杜阮蓝季贾江郭梅林钟徐邱高夏蔡田樊胡霍万卢莫房程陆翁段白邓武刘龙叶黎易廖阎庄柴牛温聂曾沙关游乔]?[\u4e00-\u9fff]{2,3}/,
    /(^|[\s|,，:：;；])[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹苏潘范彭鲁韦马苗方俞任袁柳史唐薛雷贺倪罗郝安于傅齐康伍余顾孟黄萧尹姚邵汪毛米戴宋熊纪舒项董梁杜阮蓝季贾江郭梅林钟徐邱高夏蔡田樊胡霍万卢莫房程陆翁段白邓武刘龙叶黎易廖阎庄柴牛温聂曾沙关游乔][\u4e00-\u9fff]{1,2}(?=$|[\s|,，;；])/m,
    /(?:收货地址|住址|地址)\s*[:：]\s*[^\n,，;；]{4,80}/i,
    /(?:full name|customer name|client name|contact name|recipient|name)\s*[:=]\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}/,
    /(?:请问|客户|联系人)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}(?=\s+(?:联系电话|电话|地址|phone|tel|address))/,
    /(?:my name is|i am|i'm|the user is|user is|contact is|customer is)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}/i,
    /(?:我叫|我的名字是|联系人是|客户是)\s*[\u4e00-\u9fff]{2,4}/,
    /(?:shipping address|street address|mailing address|address)\s*[:=]\s*[^\n,;]{5,120}/i,
    /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,50}\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/i,
    /data:(?:image|audio|video)\//i,
    /blob:/i,
    /Bearer\s+[A-Za-z0-9._~-]{8,}/i,
    /(?:token|password|passwd|secret|api[_-]?key|access[_-]?key)\s*[:=]\s*["']?[^\s"']{8,}/i,
    /https?:\/\/[^/@\s:]+:[^/@\s]+@/i,
  ].some(pattern => pattern.test(value))
}

function rejectSensitiveRequest(value: string): boolean {
  if (!hasSensitiveContent(value)) return false
  const safeText = redactSensitiveText(value)
  inputText.value = safeText
  sessionStore.addMessage({
    role: 'user',
    content: safeText || '（检测到敏感内容，原文已隐藏）',
    createdAt: new Date().toISOString(),
  })
  sessionStore.addMessage({
    role: 'system',
    content: '为保护你的信息，本次内容未发送、未创建 GitHub Issue。请删除凭据、联系方式、姓名、证件号、银行卡号、地址或内嵌媒体链接后重新描述；截图请先遮盖个人信息。',
    createdAt: new Date().toISOString(),
  })
  return true
}

async function stagePendingTask(triage: TriageResult, text: string, images: StepFunImageInput[]) {
  const redactedVisualSummary = redactSensitiveText(triage.visualSummary || '')
  const visualSummary = redactedVisualSummary && !hasSensitiveContent(redactedVisualSummary)
    ? redactedVisualSummary
    : ''
  const appName = triage.basedOn || extractAppName(text)
  pendingTask.value = {
    triage,
    text,
    description: visualSummary
      ? `${text}\n\n## 图片中可见的问题（已脱敏）\n\n${visualSummary}`
      : text,
    appName,
    imageCount: images.length,
  }
  buildProgress.value = { step: 0, label: `已识别为${triage.scenario === 'platform' ? '平台优化' : triage.scenario === 'app_iterate' ? '应用迭代' : '应用创建'}，等待确认` }
}

function alignTriageWithKnownApps(triage: TriageResult, text: string): TriageResult {
  if (triage.action === 'platform') return triage
  const lower = text.toLowerCase()
  const knownApps = Array.from(new Set(
    sessionStore.sessions
      .map(session => session.appLabel?.replace(/^app\//, ''))
      .filter((name): name is string => Boolean(name)),
  )).sort((a, b) => b.length - a.length)
  const matched = knownApps.find(name => lower.includes(name.toLowerCase()))
  const requestsChange = /(?:迭代|优化|修改|更新|增加|添加|修复|继续|改进|调整)/i.test(text)
  if (!matched || !requestsChange) return triage
  return {
    ...triage,
    action: 'build',
    scenario: 'app_iterate',
    intent: 'create_app',
    complexity: 'medium',
    scope: 'apps-only',
    basedOn: matched,
  }
}

async function confirmPendingTask() {
  const task = pendingTask.value
  if (!task || confirmingTask.value || building.value) return
  if (hasSensitiveContent(task.description)) {
    pendingTask.value = null
    buildProgress.value = { step: -1, label: '检测到敏感内容，任务未创建' }
    sessionStore.addMessage({
      role: 'system',
      content: '任务摘要仍包含敏感信息，已阻止写入 GitHub。请修改需求后重试。',
      createdAt: new Date().toISOString(),
    })
    return
  }
  confirmingTask.value = true
  pendingTask.value = null
  buildProgress.value = { step: 0, label: '正在创建任务...' }
  try {
    let issue: BuildIssue | null
    if (task.triage.scenario === 'platform') {
      issue = await createPlatformBuild(task.text, task.description)
    } else {
      const basedOn = task.triage.scenario === 'app_iterate' ? task.appName : undefined
      issue = await createBuild(task.appName, task.description, basedOn, task.triage.scenario)
    }
    failedCreateTask.value = issue ? null : task
  } finally {
    confirmingTask.value = false
  }
}

async function retryFailedCreate() {
  if (!failedCreateTask.value || building.value) return
  pendingTask.value = failedCreateTask.value
  failedCreateTask.value = null
  await confirmPendingTask()
}

function cancelPendingTask() {
  const task = pendingTask.value
  if (!task) return
  inputText.value = task.text
  pendingTask.value = null
  buildProgress.value = null
  sessionStore.addMessage({
    role: 'system',
    content: '已取消本次任务创建。需求文字已放回输入框，修改后可重新发送。',
    createdAt: new Date().toISOString(),
  })
}

function startIssuePolling(issueNumber: number, token: string) {
  pollingPaused.value = false
  start(
    issueNumber,
    () => getIssue(token, repo.value, issueNumber),
    onIssueUpdate,
    undefined,
    () => {
      pollingPaused.value = true
      building.value = false
      buildProgress.value = { step: 1, label: '任务仍在远程运行，状态同步已暂停', issueNumber }
      persistBuildProgress(buildProgress.value)
    },
  )
}

async function refreshActiveIssue() {
  const issueNumber = buildProgress.value?.issueNumber || sessionStore.activeSession?.issueNumber
  if (!issueNumber || !authStore.token) return
  pollingPaused.value = false
  try {
    const issue = await getIssue(authStore.token, repo.value, issueNumber)
    await onIssueUpdate(issue)
    if (issue.state !== 'closed') startIssuePolling(issueNumber, authStore.token)
  } catch {
    pollingPaused.value = true
    building.value = false
    buildProgress.value = { step: 1, label: '状态刷新失败，可稍后重试', issueNumber }
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && pollingPaused.value) void refreshActiveIssue()
}

function syncSessionUrl(issueNumber: number) {
  const url = new URL(window.location.href)
  url.searchParams.set('session', String(issueNumber))
  window.history.replaceState({}, '', url.toString())
}

function markAutoTriggerFailed(issueNumber: number, error: unknown) {
  const status = (error instanceof Error ? error.message.match(/(\d{3})/) : null)?.[1]
  failedTriggerIssueNumber.value = issueNumber
  persistFailedTrigger(issueNumber)
  building.value = false
  buildProgress.value = {
    step: -1,
    label: status === '403' ? 'GitHub 授权不足，未能自动启动' : '自动启动失败',
    issueNumber,
  }
  persistBuildProgress(buildProgress.value)
  sessionStore.addMessage({
    role: 'system',
    content: status === '403'
      ? `Issue #${issueNumber} 已创建，但当前 GitHub 授权缺少评论权限，任务尚未启动。更新授权后点击“重新自动启动”。`
      : `Issue #${issueNumber} 已创建，但自动启动失败，系统没有把它显示为运行中。请点击“重新自动启动”。`,
    createdAt: new Date().toISOString(),
  })
}

async function retryAutoTrigger() {
  const issueNumber = failedTriggerIssueNumber.value
  const token = authStore.token
  if (!issueNumber || !token || building.value) return
  building.value = true
  buildProgress.value = { step: 0, label: '正在重新自动启动...', issueNumber }
  persistBuildProgress(buildProgress.value)
  try {
    await createIssueComment(token, repo.value, issueNumber, '/create')
    clearFailedTrigger(issueNumber)
    sessionStore.addMessage({
      role: 'system',
      content: `Issue #${issueNumber} 已重新自动启动，正在同步远程状态。`,
      createdAt: new Date().toISOString(),
    })
    startIssuePolling(issueNumber, token)
    await sessionStore.loadSessions(token, repo.value)
  } catch (error) {
    markAutoTriggerFailed(issueNumber, error)
  }
}

async function handleSend(submission?: ChatSubmission) {
  const submittedText = submission?.text ?? inputText.value
  const images = submission?.images ?? []
  console.log('[MVP_SEND] entered', {
    submitted: Boolean(submittedText.trim()),
    attachments: images.length,
    owner: isOwner.value,
    auth: Boolean(authStore.token),
    step: Boolean(stepToken.value),
  })
  if (!isOwner.value) return
  if (sessionStore.activeSession?.status === 'closed') return
  const text = submittedText.trim()
  if ((!text && images.length === 0) || building.value || !authStore.token) return
  lastErrorKind.value = null
  retryHasAttachments.value = false
  const rawRequestText = text || '请分析我上传的图片，判断这是平台优化、应用创建、应用迭代还是咨询。'
  if (text && rejectSensitiveRequest(text)) return
  const requestText = redactSensitiveText(rawRequestText)
  if (hasSensitiveContent(requestText)) {
    rejectSensitiveRequest(requestText)
    return
  }
  lastRetryInput.value = requestText
  pendingTask.value = null

  // ── /create 命令：直接触发构建，跳过 StepFun ──
  const createCmd = detectCreateCommand(requestText)
  if (createCmd.triggered) {
    const rawDescription = createCmd.description || requestText
    // Strip command prefix for app name extraction
    const description = rawDescription.replace(/^\/create\s+/, '').trim() || rawDescription
    const appName = extractAppName(description)
    sessionStore.addMessage({
      role: 'user',
      content: requestText,
      createdAt: new Date().toISOString(),
    })
    sessionStore.addMessage({
      role: 'assistant',
      content: `🚀 检测到 /create 命令，直接启动构建流程...\n\n${description}`,
      createdAt: new Date().toISOString(),
    })
    inputText.value = ''
    await createBuild(appName, description)
    return
  }

  // ── /status 命令：查询 agent 状态 ──
  const statusCmd = detectStatusCommand(requestText)
  if (statusCmd.triggered) {
    const statusResult = await sessionStore.checkAgentStatus(authStore.token, REPO_FULL_NAME, sessionStore.activeSession!.issueNumber)
    sessionStore.addMessage({
      role: 'user',
      content: requestText,
      createdAt: new Date().toISOString(),
    })
    sessionStore.addMessage({
      role: 'system',
      content: `📊 Agent 状态: ${statusResult.text}`,
      createdAt: new Date().toISOString(),
    })
    inputText.value = ''
    return
  }

  // ── /stop 命令：停止构建 ──
  const stopCmd = detectStopCommand(requestText)
  if (stopCmd.triggered) {
    const session = sessionStore.activeSession!
    await updateIssue(authStore.token, REPO_FULL_NAME, session.issueNumber, 'closed', [...session.labels, 'status:cancelled'])
    sessionStore.addMessage({
      role: 'user',
      content: requestText,
      createdAt: new Date().toISOString(),
    })
    sessionStore.addMessage({
      role: 'system',
      content: `🛑 已停止 Issue #${session.issueNumber} 的构建任务。`,
      createdAt: new Date().toISOString(),
    })
    session.status = 'closed'
    inputText.value = ''
    return
  }

  // ── /start 命令：重新触发构建 ──
  const startCmd = detectStartCommand(requestText)
  if (startCmd.triggered) {
    const session = sessionStore.activeSession!
    await updateIssue(authStore.token, REPO_FULL_NAME, session.issueNumber, 'open', session.labels.filter((l: string) => l !== 'status:cancelled'))
    sessionStore.addMessage({
      role: 'user',
      content: requestText,
      createdAt: new Date().toISOString(),
    })
    sessionStore.addMessage({
      role: 'system',
      content: `🔄 已重新触发 Issue #${session.issueNumber} 的构建。`,
      createdAt: new Date().toISOString(),
    })
    session.status = 'open'
    inputText.value = ''
    return
  }

  // 如果正在澄清，把用户回复当作澄清回答重新分流
  const previousBuildContext = pendingBuildContext.value
  if (clarifying.value) {
    clarifying.value = false
    clarifyingMsg.value = ''
  }

  sessionStore.addMessage({
    role: 'user',
    content: images.length > 0 ? `${requestText}\n\n📎 已附加 ${images.length} 张图片（原图不会写入会话或 GitHub Issue）` : requestText,
    createdAt: new Date().toISOString(),
  })
  inputText.value = ''
  thinking.value = true

  try {
    // ── 1. 分流：关键词快速通道 → LLM 语义分拣 → 降级澄清（最多一次）──
    let triage = await smartTriage(requestText, {
      stepToken: stepToken.value || undefined,
      clarifyContext: previousBuildContext || undefined,
      images,
    })
    triage = alignTriageWithKnownApps(triage, requestText)
    logTriage(triage)
    console.log('[MVP_SEND] triage', triage.action)

    // 分流已有明确去向时清掉澄清上下文，避免污染后续消息
    if (triage.action !== 'clarify') {
      pendingBuildContext.value = ''
    }

    // ── 2. 澄清（R6）──
    if (triage.action === 'clarify') {
      clarifying.value = true
      // 防止重复展示相同澄清消息
      const last = sessionStore.messages.at(-1)
      if (!last || !last.content?.startsWith('我需要确认一下你的意图')) {
        // 保存原始上下文，澄清回答时合并使用
        if (!pendingBuildContext.value && requestText) {
          pendingBuildContext.value = requestText
        }
        clarifyingMsg.value = `我需要确认一下你的意图：

1. **你是想创建一个新应用，还是修改已有的应用？**
   - 新应用：请告诉我类型（游戏/工具/编辑器）和核心功能
   - 修改已有应用：请告诉我应用名称和具体要改什么

2. **这个改动是在 Mitosis 平台本身，还是在某个已部署的应用上？**`
        sessionStore.addMessage({
          role: 'assistant',
          content: clarifyingMsg.value,
          createdAt: new Date().toISOString(),
        })
      }
      return
    }

    // ── 3. 分流执行 ──
    // R3 build：直接创建构建，不再依赖 StepFun 输出 BUILD_APP 标记
    // 这样即使模型未按 prompt 输出标记，也能正确触发构建
    if (triage.action === 'build') {
      if (!text && images.length > 0) {
        buildProgress.value = { step: 0, label: '已识别为应用任务，等待文字说明' }
        sessionStore.addMessage({
          role: 'system',
          content: '我已用图片判断任务类型，但不会保存或转录图中文字。请补充一句你希望修改或创建什么，图片会保留在输入区。',
          createdAt: new Date().toISOString(),
        })
        return
      }
      const description = previousBuildContext
        ? `${previousBuildContext}\n\n## 澄清回答\n\n${requestText}`
        : requestText
      pendingBuildContext.value = ''
      await stagePendingTask(triage, description, images)
      chatInputRef.value?.clearImages()
      return
    }

    if (triage.action === 'platform') {
      if (!text && images.length > 0) {
        buildProgress.value = { step: 0, label: '已识别为平台任务，等待文字说明' }
        sessionStore.addMessage({
          role: 'system',
          content: '我已用图片判断任务类型，但不会保存或转录图中文字。请补充一句要优化的平台体验，图片会保留在输入区。',
          createdAt: new Date().toISOString(),
        })
        return
      }
      await stagePendingTask(triage, requestText, images)
      chatInputRef.value?.clearImages()
      return
    }

    // R1/R2 chat：调用 StepFun 生成回复
    if (images.length > 0) {
      sessionStore.addMessage({
        role: 'assistant',
        content: '图片已用于安全分流。为避免把截图中的姓名、联系方式、地址或凭据写入会话，我不会转录图中文字；请用文字描述你希望我解释的问题。',
        createdAt: new Date().toISOString(),
      })
      chatInputRef.value?.clearImages()
      return
    }
    const history = getConversationHistory()
    const systemPrompt = `${getSystemPrompt(triage, authStore.user?.login)}\n\n隐私要求：不得转录或复述图片中的姓名、联系人、邮箱、手机号、证件号、银行卡号、住址、token 或其他凭据。`

    console.log('[MVP_SEND] chat-call')
    const response = await chatWithStepFun(stepToken.value, history, { system: systemPrompt })
    const trimmed = response.trim()
    const redactedResponse = redactSensitiveText(trimmed)
    const safeResponse = !redactedResponse || hasSensitiveContent(redactedResponse)
      ? '模型响应包含无法安全展示的敏感信息，内容已全部隐藏。请先遮盖图片中的个人信息后重试。'
      : redactedResponse

    sessionStore.addMessage({
      role: 'assistant',
      content: safeResponse,
      createdAt: new Date().toISOString(),
    })
    chatInputRef.value?.clearImages()

    // chat (R1/R2): 直接回复。任务类意图已在上方进入显式确认卡。
  } catch (e) {
    const formatted = formatStepFunError(e)
    lastErrorKind.value = formatted.kind
    retryHasAttachments.value = images.length > 0

    // 失败时保持 fail-closed：不绕过确认创建 Issue。
    const fallbackContent = `${formatted.title}\n\n${formatted.detail}\n\n本次没有创建任务，请重试；自然语言需求识别成功后会先显示确认卡。\n\n💡 ${formatted.suggestion}`

    sessionStore.addMessage({
      role: 'system',
      content: fallbackContent,
      createdAt: new Date().toISOString(),
    })
  } finally {
    thinking.value = false
  }
}

/** 恢复操作：重试最后一条消息 */
const lastRetryInput = ref('')
async function handleRetry() {
  if (retryHasAttachments.value) return
  const text = lastRetryInput.value || inputText.value.trim()
  if (!text) return
  lastErrorKind.value = null
  inputText.value = text
  lastRetryInput.value = ''
  await handleSend()
}

/** 恢复操作：直接创建构建 Issue（绕过 LLM） */
async function handleCreateDirectIssue() {
  const text = lastRetryInput.value || inputText.value.trim()
  if (!text || building.value) return
  lastErrorKind.value = null
  const appName = extractAppName(text)
  lastRetryInput.value = ''
  await createBuild(appName, text)
}

/** 平台构建：开始确认流程 */
function startConfirmPlatform() {
  confirmingPlatform.value = true
  confirmingPlatformTimer.value = setTimeout(() => {
    confirmingPlatform.value = false
  }, 5000)
}

/** 平台构建：确认创建 */
async function confirmCreatePlatform() {
  if (confirmingPlatformTimer.value) {
    clearTimeout(confirmingPlatformTimer.value)
    confirmingPlatformTimer.value = null
  }
  const text = lastRetryInput.value || inputText.value.trim()
  if (!text || building.value) return
  confirmingPlatform.value = false
  lastErrorKind.value = null
  lastRetryInput.value = ''
  await createPlatformBuildDirect(text)
}

/** 平台构建：取消确认 */
function cancelConfirmPlatform() {
  confirmingPlatform.value = false
  if (confirmingPlatformTimer.value) {
    clearTimeout(confirmingPlatformTimer.value)
    confirmingPlatformTimer.value = null
  }
}

/** 恢复操作：更新 StepFun token */
function handleUpdateToken() {
  lastErrorKind.value = null
  // 清除 setup 完成标记，让用户能重新进入 Setup 页面输入新 token
  authStore.setupComplete = false
  if (typeof window !== 'undefined') {
    localStorage.removeItem('mitosis_setup_complete')
  }
  // 通知父组件切换到 Setup 视图
  emit('navigate', 'setup')
}

async function createBuild(appName: string, description: string, basedOn?: string, scenario?: 'platform' | 'app_create' | 'app_iterate'): Promise<BuildIssue | null> {
  if (building.value || !authStore.token || !isOwner.value) return null

  building.value = true
  activeIssue.value = null
  buildProgress.value = { step: 0, label: '分析需求...' }
  persistBuildProgress(buildProgress.value)
  const effectiveScenario = scenario || (basedOn ? 'app_iterate' : 'app_create')
  let currentVersion = -1
  if (effectiveScenario === 'app_iterate') {
    try {
      currentVersion = await getLatestAppVersion(authStore.token!, repo.value, appName, { required: true })
    } catch {
      building.value = false
      buildProgress.value = { step: -1, label: '无法确认现有应用版本，任务未创建' }
      sessionStore.addMessage({
        role: 'system',
        content: `无法读取 ${appName} 的现有版本，已停止创建任务，避免覆盖或生成错误版本。请确认应用标识和 GitHub 连接后重试。`,
        createdAt: new Date().toISOString(),
      })
      return null
    }
  }
  const version = effectiveScenario === 'app_iterate' ? `v${currentVersion + 1}` : 'v0'
  const labels = effectiveScenario === 'platform'
    ? ['platform']
    : effectiveScenario === 'app_iterate'
      ? [`app/${appName}`, 'update']
      : [`app/${appName}`]
  const basedOnLine = basedOn ? `\n- 基于: ${basedOn}` : ''
  const body = `## 需求描述\n\n${description}${basedOn ? `\n\n## 基于现有应用\n\n基于应用: ${basedOn}` : ''}\n\n## 构建信息\n\n- 应用名称: ${appName}\n- 版本: ${version}\n- 触发方式: Web 界面${basedOnLine}`

  try {
    const token = authStore.token!
    const issue = await createIssue(token, repo.value, `build: ${appName} ${version}`, body, labels)
    syncSessionUrl(issue.number)
    buildProgress.value = { step: 0, label: '任务已创建，正在启动...', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)

    // 自动评论 /create 触发 CI Agent Loop
    try {
      await createIssueComment(token, repo.value, issue.number, '/create')
    } catch (commentErr) {
      markAutoTriggerFailed(issue.number, commentErr)
      await sessionStore.loadSessions(token, repo.value)
      return issue
    }

    sessionStore.addMessage({
      role: 'system',
      content: `已创建构建任务 #${issue.number} — ${appName} ${version}\n正在启动构建流程...`,
      createdAt: new Date().toISOString(),
    })

    startIssuePolling(issue.number, token)
    // 刷新会话列表
    await sessionStore.loadSessions(authStore.token!, repo.value)
    return issue
  } catch (e) {
    const err = e instanceof Error ? e : new Error('未知错误')
    const statusMatch = err.message.match(/(\d{3})/)
    const status = statusMatch?.[1]
    // 网络错误分类（Failed to fetch / NetworkError / timeout）
    const isNetworkError = /failed to fetch|networkerror|network\s*error|timeout|cors|typeerror/i.test(err.message)
    console.error('[createBuild] request failed', { status: status || 'unknown', network: isNetworkError })
    const fallbackMsg = status === '403'
      ? '当前 GitHub 授权无仓库写入权限（403），任务未创建。更新授权后点击“重新自动创建”。'
      : isNetworkError
        ? '网络连接失败，任务未创建。请检查网络后点击“重新自动创建”。'
        : `❌ 创建任务失败: ${formatUserError(err)}`

    sessionStore.addMessage({
      role: 'system',
      content: fallbackMsg,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    buildProgress.value = { step: -1, label: '任务创建失败' }
    return null
  }
}

// 平台变更直接构建（模型判断可执行时触发）
async function createPlatformBuild(originalText: string, description: string): Promise<BuildIssue | null> {
  if (building.value || !authStore.token || !isOwner.value) return null

  building.value = true
  activeIssue.value = null
  buildProgress.value = { step: 0, label: '正在创建平台任务...' }
  const title = `platform: ${originalText.slice(0, 60)}${originalText.length > 60 ? '…' : ''}`
  const body = `## 需求描述\n\n${description}\n\n## 构建信息\n\n- 触发方式: Web 界面（AI 判断可直接执行）`

  try {
    const token = authStore.token!
    const issue = await createIssue(token, repo.value, title, body, ['platform'])
    syncSessionUrl(issue.number)
    buildProgress.value = { step: 0, label: '任务已创建，正在启动...', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)

    // 自动评论 /create 触发 CI Agent Loop
    try {
      await createIssueComment(token, repo.value, issue.number, '/create')
    } catch (commentErr) {
      markAutoTriggerFailed(issue.number, commentErr)
      await sessionStore.loadSessions(token, repo.value)
      return issue
    }

    sessionStore.addMessage({
      role: 'system',
      content: `🔨 已创建平台构建任务 #${issue.number}，CI 将自动构建。\n查看: https://github.com/${repo.value}/issues/${issue.number}`,
      createdAt: new Date().toISOString(),
    })

    startIssuePolling(issue.number, token)
    await sessionStore.loadSessions(authStore.token!, repo.value)
    return issue
  } catch (e) {
    const err = e instanceof Error ? e : new Error('未知错误')
    const statusMatch = err.message.match(/(\d{3})/)
    const status = statusMatch?.[1]
    const fallbackMsg = status === '403'
      ? '当前 GitHub 授权无仓库写入权限（403），平台任务未创建。更新授权后点击“重新自动创建”。'
      : `❌ 创建平台构建失败: ${formatUserError(err)}`

    sessionStore.addMessage({
      role: 'system',
      content: fallbackMsg,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    buildProgress.value = { step: -1, label: '平台任务创建失败' }
    return null
  }
}

// 平台变更直接构建（不依赖 LLM，兜底路径）
async function createPlatformBuildDirect(originalText: string): Promise<BuildIssue | null> {
  if (building.value || !authStore.token || !isOwner.value) return null

  building.value = true
  activeIssue.value = null
  buildProgress.value = { step: 0, label: '正在创建平台任务...' }
  const title = `platform: ${originalText.slice(0, 60)}${originalText.length > 60 ? '…' : ''}`
  const body = `## 需求描述\n\n${originalText}\n\n## 构建信息\n\n- 触发方式: Web 界面（LLM 不可用，直连兜底）`

  try {
    const token = authStore.token!
    const issue = await createIssue(token, repo.value, title, body, ['platform'])
    syncSessionUrl(issue.number)
    buildProgress.value = { step: 0, label: '任务已创建，正在启动...', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)

    // 自动评论 /create 触发 CI Agent Loop
    try {
      await createIssueComment(token, repo.value, issue.number, '/create')
    } catch (commentErr) {
      markAutoTriggerFailed(issue.number, commentErr)
      await sessionStore.loadSessions(token, repo.value)
      return issue
    }

    sessionStore.addMessage({
      role: 'system',
      content: `🔨 已直接创建平台构建任务 #${issue.number}，CI 将自动构建。\n查看: https://github.com/${repo.value}/issues/${issue.number}`,
      createdAt: new Date().toISOString(),
    })

    startIssuePolling(issue.number, token)
    await sessionStore.loadSessions(authStore.token!, repo.value)
    return issue
  } catch (e) {
    const err = e instanceof Error ? e : new Error('未知错误')
    const statusMatch = err.message.match(/(\d{3})/)
    const status = statusMatch?.[1]
    const repoFull = repo.value
    const encodedBody = encodeURIComponent(`## 需求描述\n\n${originalText}\n\n## 构建信息\n\n- 触发方式: Web 界面（LLM 不可用，直连兜底）`)
    const fallbackUrl = `https://github.com/${repoFull}/issues/new?title=${encodeURIComponent(title)}&body=${encodedBody}&labels=platform`

    console.error('[createPlatformBuildDirect] request failed', { status: status || 'unknown' })
    const fallbackMsg = status === '403'
      ? `⚠️ 当前 Token 无仓库写入权限（403），无法自动创建平台构建任务。\n\n请点击下方链接手动创建：\n[在 GitHub 上创建 Issue](${fallbackUrl})`
      : `❌ 创建平台构建失败: ${formatUserError(err)}`

    sessionStore.addMessage({
      role: 'system',
      content: fallbackMsg,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    buildProgress.value = { step: -1, label: '平台任务创建失败' }
    return null
  }
}

async function onIssueUpdate(issue: BuildIssue) {
  const previousLabels = new Set(activeIssue.value?.labels.map(label => label.name) || [])
  activeIssue.value = issue
  pollingPaused.value = false
  // 同步更新 session store 中的 labels，使侧边栏状态实时一致（C6.3）
  const session = sessionStore.sessions.find(s => s.issueNumber === issue.number)
  if (session) {
    session.labels = issue.labels.map(l => l.name)
    session.status = issue.state
    session.updatedAt = new Date().toISOString()
    sessionStore._writeCache(sessionStore.sessions)
  }
  const labels = new Set(issue.labels.map(label => label.name))
  if (issue.state === 'closed' || Array.from(labels).some(label => label.startsWith('status:'))) {
    clearFailedTrigger(issue.number)
  }
  const isPlatformIssue = labels.has('platform')
  const appName = isPlatformIssue ? 'platform' : extractAppNameFromIssue(issue)
  // 从 apps 目录获取真实最新版本（不依赖 issue 标题）
  const latestVer = isPlatformIssue ? 0 : await getLatestAppVersion(authStore.token!, repo.value, appName)
  const isIteration = labels.has('update')
  const displayedVersion = issue.state === 'closed' ? latestVer : isIteration ? latestVer + 1 : latestVer
  const version = `v${Math.max(0, displayedVersion)}`
  const appUrl = `https://mitosis.zenheart.site/apps/${appName}/${version}/`
  const issueUrl = `https://github.com/${repo.value}/issues/${issue.number}`
  const targetName = isPlatformIssue ? 'Mitosis 平台变更' : `${appName} ${version}`

  if (labels.has('status:cancelled')) {
    buildProgress.value = { step: -1, label: '已停止', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)
    sessionStore.addMessage({
      role: 'system',
      content: `🛑 ${targetName} 已停止。([Issue #${issue.number}](${issueUrl}))`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (labels.has('status:failed')) {
    buildProgress.value = { step: -1, label: '构建失败', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)
    sessionStore.addMessage({
      role: 'system',
      content: `❌ ${targetName} 自动验证失败，请查看 [Issue #${issue.number}](${issueUrl}) 和 Actions 日志。`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (issue.state === 'closed') {
    buildProgress.value = { step: 4, label: '已完成', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)
    sessionStore.addMessage({
      role: 'system',
      content: isPlatformIssue
        ? `Issue #${issue.number} 已关闭。平台变更流程已结束。`
        : `Issue #${issue.number} 已关闭。应用版本路径: ${appUrl}`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (labels.has('status:review')) {
    buildProgress.value = { step: 3, label: '等待审查', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)
    sessionStore.addMessage({
      role: 'system',
      content: isPlatformIssue
        ? `✅ ${targetName} 已通过自动验证，等待人工审查。\n[前往 GitHub 审查](${issueUrl})\n合入 master 后将自动部署到线上。`
        : `✅ ${targetName} 已通过自动验证，等待人工审查。\n[前往 GitHub 审查](${issueUrl})\n合入 master 后访问: ${appUrl}`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (labels.has('status:verifying') && !previousLabels.has('status:verifying')) {
    buildProgress.value = { step: 2, label: '验证中', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)
    sessionStore.addMessage({
      role: 'system',
      content: `🔎 正在验证 ${targetName}... ([Issue #${issue.number}](${issueUrl}))`,
      createdAt: new Date().toISOString(),
    })
    return
  }

  if (labels.has('status:building') && !previousLabels.has('status:building')) {
    buildProgress.value = { step: 1, label: '构建中', issueNumber: issue.number }
    persistBuildProgress(buildProgress.value)
    sessionStore.addMessage({
      role: 'system',
      content: `🔨 正在构建 ${targetName}... ([Issue #${issue.number}](${issueUrl}))`,
      createdAt: new Date().toISOString(),
    })
    return
  }

}

function extractAppNameFromIssue(issue: BuildIssue): string {
  const appLabel = issue.labels.find(label => label.name.startsWith('app/'))?.name
  if (appLabel) return appLabel.replace(/^app\//, '')

  const titleMatch = issue.title.match(/^build:\s*([a-z0-9-]+)/i)
  return titleMatch?.[1]?.toLowerCase() || extractAppName(issue.title)
}

function stableFallbackAppSlug(input: string): string {
  let hash = 2166136261
  for (const character of input) {
    hash ^= character.codePointAt(0) || 0
    hash = Math.imul(hash, 16777619)
  }
  return `app-${(hash >>> 0).toString(36)}`
}

function extractAppName(input: string): string {
  const cleaned = input.toLowerCase().replace(/^\/create\s+/, '').replace(/^\/build\s+/, '')

  // 1. 优先检查完整应用名（避免部分匹配：tetris → tetris-game 的问题）
  const knownFullNames = ['tetris-game', 'snake-game', 'todo-app', 'calculator', 'breakout', 'flappy-bird', '2048', 'pong', 'paint', 'chat-app', 'doodle', 'pixel-art', 'my-app']
  const exactMatch = knownFullNames.find(name => cleaned === name || cleaned.startsWith(name + ' ') || cleaned.startsWith(name + '-'))
  if (exactMatch) return exactMatch

  // 2. 中文应用名别名映射（已知应用的中文名 → slug，优先于通用正则）
  const chineseAliases: Record<string, string> = {
    '俄罗斯方块': 'tetris-game',
    '贪吃蛇': 'snake-game',
    '打砖块': 'breakout',
    'flappy鸟': 'flappy-bird',
    'flappy': 'flappy-bird',
    '2048': '2048',
    '画板': 'paint',
    '聊天': 'chat-app',
    '涂鸦': 'doodle',
    'todo': 'todo-app',
    '待办': 'todo-app',
    '计算器': 'calculator',
    '记账': 'expense-tracker',
    '天气': 'weather-app',
    '番茄钟': 'pomodoro-timer',
    '番茄': 'pomodoro-timer',
  }
  const aliasMatch = Object.keys(chineseAliases).find(name => cleaned.includes(name))
  if (aliasMatch) return chineseAliases[aliasMatch]

  // 3. 已知英文应用名（允许出现在自然语言句子中）。
  const knownEnglishMatch = cleaned.match(/(snake-game|tetris-game|todo-app|calculator|breakout|flappy-bird|flappy|paint|chat-app|doodle|pixel-art|2048|pong)/i)
  if (knownEnglishMatch) return knownEnglishMatch[1].toLowerCase()

  // 4. 通用英文名只从 “name app/game/tool” 提取，避免把整句需求变成超长 label。
  const genericEnglish = cleaned.match(/\b([a-z][a-z0-9-]{1,32})\s+(?:app|game|tool)\b/i)?.[1]
  if (genericEnglish) return genericEnglish.endsWith('-app') ? genericEnglish : `${genericEnglish}-app`

  // 5. 无法可靠提取时使用稳定且安全的临时 slug；确认卡允许用户在创建前修改。
  return stableFallbackAppSlug(cleaned)
}

function restoreSessionProgress(session: ChatSession) {
  const labels = new Set(session.labels || [])
  const issueNumber = session.issueNumber
  const hasRemoteStatus = session.status === 'closed' || Array.from(labels).some(label => label.startsWith('status:'))
  if (hasRemoteStatus) clearFailedTrigger(issueNumber)
  if (labels.has('status:cancelled')) {
    buildProgress.value = { step: -1, label: '已停止', issueNumber }
    building.value = false
  } else if (labels.has('status:failed')) {
    buildProgress.value = { step: -1, label: '构建失败', issueNumber }
    building.value = false
  } else if (session.status === 'closed') {
    buildProgress.value = { step: 4, label: '已完成', issueNumber }
    building.value = false
  } else if (labels.has('status:review')) {
    buildProgress.value = { step: 3, label: '等待人工审查', issueNumber }
    building.value = false
  } else if (labels.has('status:verifying')) {
    buildProgress.value = { step: 2, label: '验证中', issueNumber }
    building.value = true
  } else if (labels.has('status:building')) {
    buildProgress.value = { step: 1, label: '构建中', issueNumber }
    building.value = true
  } else if (hasPersistedFailedTrigger(issueNumber)) {
    failedTriggerIssueNumber.value = issueNumber
    buildProgress.value = { step: -1, label: '自动启动失败', issueNumber }
    building.value = false
  } else {
    buildProgress.value = { step: 0, label: '任务已创建，等待启动', issueNumber }
    building.value = false
  }
}

async function navigateToSession(session: ChatSession) {
  sidebarOpen.value = false
  // RESTful: URL query 参数记录会话状态
  const url = new URL(window.location.href)
  url.searchParams.set('session', String(session.issueNumber))
  window.history.pushState({}, '', url.toString())
  await loadSession(session)
}

async function loadSession(session: ChatSession, autoOpenApp = false) {
  stopAll()
  sessionStore.setActiveSession(session)
  const loaded = await sessionStore.loadMessages(authStore.token!, repo.value, session.issueNumber)
  if (!loaded || sessionStore.activeSession?.issueNumber !== session.issueNumber) return
  inputText.value = ''
  pendingTask.value = null
  failedCreateTask.value = null
  retryHasAttachments.value = false
  activeIssue.value = null
  restoreSessionProgress(session)
  if (session.status !== 'closed' && !hasPersistedFailedTrigger(session.issueNumber)) {
    startIssuePolling(session.issueNumber, authStore.token!)
  }
  // 从 URL ?session= 恢复时，如果会话关联了应用，自动打开应用页面
  if (autoOpenApp && session.appLabel) {
    await openAppSession(session)
  }
}

async function openAppSession(session: ChatSession) {
  const appName = session.appLabel?.replace('app/', '') || ''
  if (!appName) return
  // 平台构建不生成应用目录，跳过
  if (session.labels?.includes('platform')) return
  // 优先从 GitHub apps 目录获取真实最新版本（不依赖 issue 标题）
  const latestVer = await getLatestAppVersion(authStore.token!, repo.value, appName)
  const version = latestVer > 0 ? `v${latestVer}` : 'v0'
  window.open(`/apps/${appName}/${version}/`, '_blank', 'noopener,noreferrer')
}

function handleNewChat() {
  sidebarOpen.value = false
  stopAll()
  const prevIssueNumber = activeIssue.value?.number
  sessionStore.setActiveSession(null)
  sessionStore.clearMessages(prevIssueNumber)
  activeIssue.value = null
  buildProgress.value = null
  if (prevIssueNumber) clearBuildProgress(prevIssueNumber)
  building.value = false
  clarifying.value = false
  clarifyingMsg.value = ''
  pendingBuildContext.value = ''
  pendingTask.value = null
  failedCreateTask.value = null
  confirmingTask.value = false
  pollingPaused.value = false
  retryHasAttachments.value = false
  failedTriggerIssueNumber.value = null
}
</script>

<template>
  <div class="workspace">
    <!-- 移动端侧边栏遮罩 -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>
    <!-- 移动端侧边栏开关 -->
    <button
      class="sidebar-toggle-mobile"
      @click="sidebarOpen = !sidebarOpen"
      :aria-label="sidebarOpen ? '关闭菜单' : '打开菜单'"
      :aria-expanded="sidebarOpen"
      aria-controls="workspace-sidebar"
    >
      <PanelLeft :size="22" stroke-width="2" />
    </button>
    <aside id="workspace-sidebar" class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <div class="sidebar-header-left">
          <h2><Dna :size="20" stroke-width="2" /> Mitosis</h2>
          <button class="sidebar-close-mobile" @click="sidebarOpen = false" aria-label="关闭侧边栏">
            <X :size="18" stroke-width="2" />
          </button>
        </div>
        <div class="user-info">
          <img
            v-if="authStore.user?.avatar_url"
            :src="authStore.user.avatar_url"
            :alt="`${authStore.user.login} 的头像`"
            width="28"
            height="28"
            class="avatar"
          />
          <span class="username">{{ authStore.user?.login }}</span>
          <button @click="authStore.logout" class="logout-btn" title="退出登录" aria-label="退出登录">⏻</button>
        </div>
      </div>
      <nav class="nav">
        <button @click="handleNewChat" class="new-chat-btn">+ 新建对话</button>
      </nav>
      <div class="sessions-list" v-if="sessionStore.sortedSessions.length || sessionSearch">
        <h3>会话</h3>

        <!-- 搜索框 -->
        <div class="sidebar-search">
          <span class="search-icon" aria-hidden="true">🔍</span>
          <input
            v-model="sessionSearch"
            type="text"
            placeholder="搜索标题或应用名..."
            class="search-input"
            aria-label="搜索会话"
          />
        </div>

        <!-- 搜索模式：显示搜索结果（带图标） -->
        <template v-if="sessionSearch.trim()">
          <div class="search-results" v-if="searchResults.length">
            <a
              v-for="session in searchResults"
              :key="session.issueNumber"
              href="#"
              class="session-item"
              :class="{
                active: sessionStore.activeSession?.issueNumber === session.issueNumber,
                closed: session.status === 'closed'
              }"
              @click.prevent="navigateToSession(session)"
            >
              <Dna v-if="session.labels?.includes('platform')" :size="16" stroke-width="2" />
              <Smartphone v-else-if="session.appLabel" :size="16" stroke-width="2" />
              <MessageSquare v-else :size="16" stroke-width="2" />
              <span class="session-title">{{ session.title }}</span>
              <span class="session-status" :class="statusClass(session)">{{ sessionStore.getSessionDisplayStatus(session) }}</span>
            </a>
          </div>
          <div v-else class="no-results">未找到匹配的会话</div>
        </template>

        <!-- 正常模式：快捷访问 + 平台 + 应用分组 + 最近关闭 -->
        <template v-else>
          <!-- 快捷访问（最近使用的应用） -->
          <template v-if="quickAccessApps.length">
            <button class="session-group-label" :aria-expanded="!isSessionGroupCollapsed('quick')" @click="toggleSessionGroup('quick')">
              <Star :size="14" stroke-width="2" /> 快捷访问
              <span class="session-count">{{ quickAccessApps.length }}</span>
              <span class="group-chevron" aria-hidden="true">{{ isSessionGroupCollapsed('quick') ? '＋' : '－' }}</span>
            </button>
            <div v-show="!isSessionGroupCollapsed('quick')" class="session-group-items">
              <div
                v-for="group in quickAccessApps"
                :key="'qa-' + group.appName"
                class="session-item app-group quick-access-item"
              >
                <button class="session-main-btn" @click="navigateToSession(group.latest)">
                  <Smartphone :size="16" stroke-width="2" />
                  <span class="session-title">{{ group.appName }}</span>
                  <span class="session-time">{{ relativeTime(group.latest.updatedAt) }}</span>
                </button>
                <button class="session-open-btn" @click.stop="openAppSession(group.latest)" title="打开应用">打开</button>
              </div>
            </div>
          </template>

          <!-- 平台会话（open only） -->
          <template v-if="platformSessions.length">
            <button class="session-group-label" :aria-expanded="!isSessionGroupCollapsed('platform')" @click="toggleSessionGroup('platform')">
              <Dna :size="14" stroke-width="2" /> 平台
              <span class="session-count">{{ platformSessions.length }}</span>
              <span class="group-chevron" aria-hidden="true">{{ isSessionGroupCollapsed('platform') ? '＋' : '－' }}</span>
            </button>
            <div v-show="!isSessionGroupCollapsed('platform')" class="session-group-items">
              <a
                v-for="session in platformSessions"
                :key="session.issueNumber"
                href="#"
                class="session-item"
                :class="{ active: sessionStore.activeSession?.issueNumber === session.issueNumber }"
                @click.prevent="navigateToSession(session)"
              >
                <span class="session-title">{{ session.title }}</span>
                <span class="session-status" :class="statusClass(session)">{{ sessionStore.getSessionDisplayStatus(session) }}</span>
              </a>
            </div>
          </template>

          <!-- 应用会话：按 app name 聚类，只显示 open -->
          <template v-if="clusteredAppGroups.length">
            <button class="session-group-label" :aria-expanded="!isSessionGroupCollapsed('apps')" @click="toggleSessionGroup('apps')">
              <Smartphone :size="14" stroke-width="2" /> 我的应用
              <span class="session-count">{{ clusteredAppGroups.length }}</span>
              <span class="group-chevron" aria-hidden="true">{{ isSessionGroupCollapsed('apps') ? '＋' : '－' }}</span>
            </button>
            <div v-show="!isSessionGroupCollapsed('apps')" class="session-group-items">
              <div v-for="group in clusteredAppGroups" :key="group.appName" class="app-cluster">
                <div
                  class="session-item app-group"
                  :class="{ active: group.sessions.some(session => sessionStore.activeSession?.issueNumber === session.issueNumber) }"
                >
                  <button
                    class="app-group-toggle"
                    :aria-expanded="isAppGroupExpanded(group.appName)"
                    :aria-label="`${isAppGroupExpanded(group.appName) ? '收起' : '展开'} ${group.appName} 的 ${group.sessions.length} 个会话`"
                    @click="toggleAppGroup(group.appName)"
                  >
                    <span class="app-group-chevron" aria-hidden="true">{{ isAppGroupExpanded(group.appName) ? '▾' : '▸' }}</span>
                    <Smartphone :size="16" stroke-width="2" />
                    <span class="session-title app-name-title" :title="group.appName">{{ group.appName }}</span>
                    <span class="session-count">{{ group.sessions.length }}</span>
                  </button>
                  <button class="session-open-btn" @click="openAppSession(group.latest)" title="打开最新版本">打开</button>
                </div>
                <div v-show="isAppGroupExpanded(group.appName)" class="app-session-list">
                  <button
                    v-for="session in group.sessions"
                    :key="session.issueNumber"
                    class="nested-session-item"
                    :class="{ active: sessionStore.activeSession?.issueNumber === session.issueNumber }"
                    @click="navigateToSession(session)"
                  >
                    <span class="session-title">{{ session.title }}</span>
                    <span class="session-time">{{ relativeTime(session.updatedAt) }}</span>
                    <span class="session-status" :class="statusClass(session)">{{ sessionStore.getSessionDisplayStatus(session) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- 最近关闭的会话 -->
          <template v-if="recentClosedSessions.length">
            <button class="session-group-label closed-group-label" :aria-expanded="!isSessionGroupCollapsed('closed')" @click="toggleSessionGroup('closed')">
              <ClipboardList :size="14" stroke-width="2" /> 最近关闭
              <span class="session-count">{{ recentClosedSessions.length }}</span>
              <span class="group-chevron" aria-hidden="true">{{ isSessionGroupCollapsed('closed') ? '＋' : '－' }}</span>
            </button>
            <div v-show="!isSessionGroupCollapsed('closed')" class="session-group-items">
              <a
                v-for="session in recentClosedSessions"
                :key="'closed-' + session.issueNumber"
                href="#"
                class="session-item closed-session-item"
                :class="{ active: sessionStore.activeSession?.issueNumber === session.issueNumber }"
                @click.prevent="navigateToSession(session)"
              >
                <Dna v-if="session.labels?.includes('platform')" :size="16" stroke-width="2" />
                <Smartphone v-else-if="session.appLabel" :size="16" stroke-width="2" />
                <MessageSquare v-else :size="16" stroke-width="2" />
                <span class="session-title">{{ session.title }}</span>
                <span class="session-time">{{ relativeTime(session.updatedAt) }}</span>
                <span class="session-status" :class="statusClass(session)">{{ sessionStore.getSessionDisplayStatus(session) }}</span>
              </a>
            </div>
          </template>
        </template>
      </div>
    </aside>
    <main class="chat-area" :data-mitosis-ready="isOwner && !!authStore.token && !!stepToken ? 'true' : 'false'">
      <div class="messages" role="log" aria-live="polite" aria-label="对话消息">
        <!-- 有活跃会话且没有消息时显示会话标题 -->
        <div v-if="displayMessages.length === 0 && sessionStore.activeSession" class="welcome session-welcome">
          <h3>{{ sessionStore.activeSession.title }}</h3>
          <p>Issue #{{ sessionStore.activeSession.issueNumber }} · {{ sessionStore.activeSession.messageCount }} 条消息</p>
          <p class="hint-text">发送消息开始对话</p>
          <button
            v-if="sessionStore.activeSession.appLabel"
            @click="openAppSession(sessionStore.activeSession)"
            class="back-to-app-btn"
          >
            ← 返回应用
          </button>
        </div>
        <div v-else-if="displayMessages.length === 0 && isOwner" class="welcome">
          <div class="welcome-icon">
            <Sparkles :size="48" stroke-width="1.5" />
          </div>
          <h3 class="welcome-title">👋 你好，{{ authStore.user?.login }}</h3>
          <p class="welcome-subtitle">描述你想做的事情，AI 会自动判断是构建应用还是平台变更。</p>
          <div class="examples">
            <button @click="inputText = '帮我做一个俄罗斯方块游戏，支持消行和计分'" class="example-btn">
              <Gamepad :size="16" stroke-width="2" />
              <span>游戏</span>
            </button>
            <button @click="inputText = '帮我做一个 todo 应用，支持添加、删除和标记完成'" class="example-btn">
              <FileText :size="16" stroke-width="2" />
              <span>Todo 应用</span>
            </button>
            <button @click="inputText = '帮我做一个计算器，支持加减乘除'" class="example-btn">
              <Calculator :size="16" stroke-width="2" />
              <span>计算器</span>
            </button>
            <button @click="inputText = '在 tetris-game 的基础上加一个关卡系统'" class="example-btn highlight">
              <Wand2 :size="16" stroke-width="2" />
              <span>继续迭代</span>
            </button>
            <button @click="inputText = '优化 Workspace 的聊天界面性能'" class="example-btn">
              <Settings :size="16" stroke-width="2" />
              <span>平台优化</span>
            </button>
            <button @click="inputText = 'Mitosis 目前的技术栈是什么？'" class="example-btn">
              <MessageSquare :size="16" stroke-width="2" />
              <span>咨询问题</span>
            </button>
          </div>
        </div>
        <div v-else-if="displayMessages.length === 0 && !isOwner" class="welcome">
          <h3>👋 你好，{{ authStore.user?.login }}</h3>
          <p>当前账号尚未完成自己仓库的环境设置，可以浏览已有应用，但无法创建新应用。</p>
          <p class="hint-text">完成 `{{ repo }}` 的 Pages、Worker 和 Secrets 配置后，才能使用 AI 构建功能。</p>
        </div>
        <div
          v-for="(msg, i) in displayMessages"
          :key="i"
          :class="['message', msg.role]"
        >
          <div class="message-content" v-html="sanitize(msg.text)"></div>
          <div class="message-time">{{ msg.time }}</div>
        </div>
        <div v-if="thinking" class="message system">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
        <section
          v-if="pendingTask"
          ref="taskConfirmationRef"
          class="task-confirmation"
          aria-label="确认识别到的任务"
          tabindex="-1"
        >
          <div class="task-confirmation-header">
            <span class="task-type-badge">{{ pendingTaskLabel }}</span>
            <span class="task-confidence">已自动分拣</span>
          </div>
          <h3>确认后开始执行</h3>
          <p class="task-summary">{{ pendingTask.text }}</p>
          <div class="task-meta">
            <span v-if="pendingTask.imageCount">已分析 {{ pendingTask.imageCount }} 张图片，原图不保存</span>
          </div>
          <label v-if="pendingTask.triage.scenario !== 'platform'" class="task-app-field">
            <span>应用标识</span>
            <input
              v-model.trim="pendingTask.appName"
              name="app-slug"
              maxlength="48"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              aria-describedby="app-slug-hint"
              :aria-invalid="!pendingAppNameValid"
            />
          </label>
          <p v-if="pendingTask.triage.scenario !== 'platform'" id="app-slug-hint" class="task-app-hint" :class="{ error: !pendingAppNameValid }">
            {{ pendingAppNameValid ? '用于应用目录，可在开始前修改。' : '仅支持 1–48 位小写字母、数字和连字符，首尾不能是连字符。' }}
          </p>
          <p v-if="pendingTask.description !== pendingTask.text" class="task-visual-summary">
            {{ pendingTask.description.split('## 图片中可见的问题（已脱敏）').at(-1)?.trim() }}
          </p>
          <div class="task-actions">
            <button class="task-confirm-btn" :disabled="confirmingTask || !pendingAppNameValid" @click="confirmPendingTask">
              <Hammer :size="17" stroke-width="2" />
              {{ confirmingTask ? '正在创建...' : '确认并开始' }}
            </button>
            <button class="task-edit-btn" :disabled="confirmingTask" @click="cancelPendingTask">修改需求</button>
          </div>
        </section>
        <!-- 构建进度指示器 -->
        <div v-if="buildProgress" class="build-progress" :class="{ failed: buildProgress.step < 0 }" role="status" aria-live="polite">
          <div class="build-progress-steps">
            <div class="build-step" :class="{ active: buildProgress.step >= 0, done: buildProgress.step > 0 }">
              <component :is="ClipboardList" :size="18" stroke-width="2" class="step-icon" />
              <span class="step-label">分析</span>
            </div>
            <div class="build-step-line" :class="{ active: buildProgress.step >= 1 }"></div>
            <div class="build-step" :class="{ active: buildProgress.step >= 1, done: buildProgress.step > 1 }">
              <component :is="Hammer" :size="18" stroke-width="2" class="step-icon" />
              <span class="step-label">构建</span>
            </div>
            <div class="build-step-line" :class="{ active: buildProgress.step >= 2 }"></div>
            <div class="build-step" :class="{ active: buildProgress.step >= 2, done: buildProgress.step > 3 }">
              <component :is="Search" :size="18" stroke-width="2" class="step-icon" />
              <span class="step-label">验证</span>
            </div>
            <div class="build-step-line" :class="{ active: buildProgress.step >= 3 }"></div>
            <div class="build-step" :class="{ active: buildProgress.step >= 3 }">
              <component :is="CircleCheckBig" :size="18" stroke-width="2" class="step-icon" />
              <span class="step-label">审查</span>
            </div>
          </div>
          <p class="build-progress-status">
            {{ buildProgress.label }}
            <a
              v-if="buildProgress.issueNumber"
              :href="`https://github.com/${repo}/issues/${buildProgress.issueNumber}`"
              target="_blank"
              rel="noopener noreferrer"
            >Issue #{{ buildProgress.issueNumber }}</a>
          </p>
          <button v-if="pollingPaused" class="status-refresh-btn" @click="refreshActiveIssue">
            <RefreshCw :size="15" stroke-width="2" /> 刷新状态
          </button>
          <button
            v-if="failedTriggerIssueNumber === buildProgress.issueNumber"
            class="status-refresh-btn"
            :disabled="building"
            @click="retryAutoTrigger"
          >
            <RefreshCw :size="15" stroke-width="2" /> 重新自动启动
          </button>
          <button
            v-if="failedCreateTask && !buildProgress.issueNumber"
            class="status-refresh-btn"
            :disabled="building"
            @click="retryFailedCreate"
          >
            <RefreshCw :size="15" stroke-width="2" /> 重新自动创建
          </button>
        </div>
      </div>
      <!-- 错误恢复操作栏 -->
      <div v-if="lastErrorKind && !thinking && !building" class="recovery-bar">
        <span class="recovery-label">恢复操作：</span>
        <button v-if="!retryHasAttachments" @click="handleRetry" class="recovery-btn retry-btn"><RefreshCw :size="16" stroke-width="2" /> 重试</button>
        <span v-else class="recovery-label">图片仍保留在输入区，请点击发送重试。</span>
        <button v-if="lastErrorKind === 'auth'" @click="handleUpdateToken" class="recovery-btn"><Key :size="16" stroke-width="2" /> 更新 Token</button>
        <template v-if="lastErrorKind === 'quota' || lastErrorKind === 'unknown'">
          <button
            v-if="!confirmingPlatform"
            @click="startConfirmPlatform"
            class="recovery-btn direct-btn"
          ><FileText :size="16" stroke-width="2" /> 创建平台变更任务</button>
          <template v-else>
            <span class="recovery-confirm-text">确认创建平台 Issue？</span>
            <button @click="confirmCreatePlatform" class="recovery-btn confirm-yes">✓ 确认</button>
            <button @click="cancelConfirmPlatform" class="recovery-btn confirm-no">✕ 取消</button>
          </template>
        </template>
        <button @click="handleCreateDirectIssue" class="recovery-btn direct-btn"><FileText :size="16" stroke-width="2" /> 直接建应用 Issue</button>
      </div>
      <!-- 活跃会话的应用导航栏 -->
      <div v-if="sessionStore.activeSession?.appLabel" class="app-nav-bar">
        <span class="app-nav-label"><Smartphone :size="16" stroke-width="2" /> {{ sessionStore.activeSession.appLabel.replace('app/', '') }}</span>
        <button @click="openAppSession(sessionStore.activeSession)" class="app-nav-open-btn">打开应用 →</button>
      </div>
      <ChatInput
        ref="chatInputRef"
        v-model="inputText"
        :is-owner="isOwner"
        :thinking="thinking"
        :building="building"
        :disabled="Boolean(chatInputDisabledMessage)"
        :disabled-message="chatInputDisabledMessage"
        @send="handleSend"
      />
    </main>
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
  overflow: hidden;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}

.sidebar-header-left {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.sidebar-header h2 {
  font-size: 1.1rem;
  margin-bottom: 0;
  background: linear-gradient(135deg, #58a6ff, #00e5ff, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: brandShift 8s ease-in-out infinite;
  background-size: 200% 200%;
}

.sidebar-close-mobile {
  display: none;
  background: none;
  border: none;
  font-size: 1.25rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, background 0.2s;
}

.sidebar-close-mobile:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

@keyframes brandShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.username {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.1rem;
  padding: 0.4rem;
  min-width: 36px;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
}

.logout-btn:hover {
  color: var(--error);
  background: var(--error-tint);
}

.nav {
  padding: 0.75rem;
  flex: 0 0 auto;
}

.new-chat-btn {
  width: 100%;
  padding: 0.5rem;
  min-height: 44px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: background 0.2s, border-color 0.2s;
}

.new-chat-btn:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent);
}

.sessions-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 0.75rem;
  padding-bottom: 1rem;
  margin-top: 0.25rem;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
}

.sessions-list h3 {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  padding: 0 0.25rem;
}

.sidebar-search {
  position: relative;
  margin-bottom: 0.75rem;
}

.search-icon {
  position: absolute;
  left: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.8rem;
  pointer-events: none;
  opacity: 0.5;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem 0.5rem 1.75rem;
  min-height: 36px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.search-input:focus:not(:focus-visible) {
  outline: none;
}

.search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.session-item {
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 2px;
  transition: background 0.15s, border-color 0.15s;
  overflow: hidden;
}

.session-item.app-session {
  cursor: default;
}

.session-main-btn,
.app-group-toggle,
.nested-session-item {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.session-main-btn,
.app-group-toggle {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0;
  text-align: left;
}

.session-main-btn:focus-visible,
.app-group-toggle:focus-visible,
.nested-session-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.app-cluster {
  margin-bottom: 0.2rem;
}

.app-group-chevron {
  width: 0.75rem;
  flex: 0 0 auto;
  color: var(--text-secondary);
}

.app-session-list {
  margin: 0.15rem 0 0.5rem 1.05rem;
  padding-left: 0.55rem;
  border-left: 1px solid var(--border);
}

.nested-session-item {
  width: 100%;
  min-height: 44px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.2rem 0.5rem;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  text-align: left;
}

.nested-session-item:hover,
.nested-session-item.active {
  background: var(--bg-tertiary);
}

.nested-session-item.active {
  color: var(--accent);
}

.nested-session-item .session-status {
  grid-column: 1 / -1;
  justify-self: start;
}

.session-item.closed {
  opacity: 0.55;
}

.session-group-label {
  width: 100%;
  min-height: 36px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.35rem 0.5rem 0.1rem;
  letter-spacing: 0.03em;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.session-group-label:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.group-chevron {
  margin-left: auto;
  font-size: 1rem;
  line-height: 1;
  color: var(--text-secondary);
}

.session-group-items {
  display: block;
}

.closed-group-label {
  color: var(--text-secondary);
  opacity: 0.7;
  border-top: 1px solid var(--border);
  margin-top: 0.3rem;
  padding-top: 0.5rem;
}

.session-time {
  font-size: 0.8rem;
  color: var(--text-secondary);
  opacity: 0.7;
  flex-shrink: 0;
  white-space: nowrap;
}

.closed-session-item {
  opacity: 0.6;
  font-size: 0.78rem;
}

.quick-access-item {
  background: rgba(var(--accent-rgb, 100, 180, 255), 0.05);
  border-radius: 6px;
}

.quick-access-item:hover {
  background: rgba(var(--accent-rgb, 100, 180, 255), 0.12);
}

.session-count {
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.session-status {
  font-size: 0.75rem;
  flex-shrink: 0;
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--bg-tertiary);
}

.status-active {
  color: var(--success);
  background: var(--success-tint);
}

.status-review {
  color: var(--warning);
  background: var(--warning-tint);
}

.status-error {
  color: var(--error);
  background: var(--error-tint);
}

.status-closed {
  color: var(--text-secondary);
  opacity: 0.6;
}

.session-open-btn {
  margin-left: auto;
  font-size: 0.7rem;
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 44px;
  line-height: 1.4;
}

.session-open-btn:hover {
  background: var(--accent);
  color: #fff;
}

.session-item:hover {
  background: var(--bg-tertiary);
}

.session-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.session-item.active {
  background: var(--accent-glow);
  border: 1px solid var(--accent);
  color: var(--accent);
}

.session-item:focus {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.session-item:focus:not(:focus-visible) {
  outline: none;
}

.session-title {
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  line-height: 1.3;
}

/* Chat session titles: 2-line clamp (specific contexts only) */
.quick-access-item .session-title,
.session-item:not(.app-group):not(.closed-session-item) .session-title,
.closed-session-item .session-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
}

/* App names in "我的应用" section: single-line ellipsis */
.session-item.app-group .app-name-title {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  min-width: 0;
  display: block;
}

.session-app-tag {
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.apps-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.75rem;
}

.apps-list h3 {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  padding: 0 0.25rem;
}

.empty-apps {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  padding: 0.5rem;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 应用导航栏 — 活跃会话显示当前应用 + 打开按钮 */
.app-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 1rem;
  background: var(--accent-subtle);
  border-bottom: 1px solid var(--accent-border);
  font-size: 0.85rem;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.app-nav-label {
  color: var(--text-primary);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.app-nav-open-btn {
  padding: 0.4rem 1rem;
  min-height: 44px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  box-shadow: 0 2px 8px rgba(88, 166, 255, 0.2);
}

.app-nav-open-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.3);
}

.app-nav-open-btn:active {
  transform: translateY(0) scale(0.97);
}

.back-to-app-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.back-to-app-btn:hover {
  background: var(--accent);
  color: #fff;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(88, 166, 255, 0.04) 0%, transparent 60%),
    var(--bg-primary);
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.welcome {
  text-align: center;
  margin: auto;
  padding: 3rem 1.5rem;
  animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.welcome-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  margin-bottom: 1.25rem;
  background: var(--accent-subtle);
  border: 1px solid var(--accent-border);
  border-radius: 20px;
  color: var(--accent);
  box-shadow: 0 0 24px var(--accent-glow);
  animation: iconGlow 3s ease-in-out infinite;
}

@keyframes iconGlow {
  0%, 100% { box-shadow: 0 0 24px var(--accent-glow); }
  50% { box-shadow: 0 0 40px var(--accent-glow), 0 0 60px rgba(88, 166, 255, 0.15); }
}

.welcome-title {
  font-size: 1.75rem;
  margin-bottom: 0.75rem;
  background: linear-gradient(135deg, var(--text-primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.welcome-subtitle {
  color: var(--text-secondary);
  margin-bottom: 2rem;
  font-size: 0.95rem;
  line-height: 1.6;
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.welcome.session-welcome {
  margin-top: 3rem;
}

.welcome.session-welcome .welcome-icon {
  width: 56px;
  height: 56px;
  margin-bottom: 1rem;
}

.welcome.session-welcome .welcome-title {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.welcome.session-welcome .welcome-subtitle {
  font-size: 0.88rem;
  margin-bottom: 1.25rem;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  max-width: 600px;
  margin: 0 auto;
}

.example-btn {
  padding: 0.65rem 1.2rem;
  min-height: 44px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 22px;
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 500;
  transition: background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  letter-spacing: 0.01em;
  position: relative;
  overflow: hidden;
}

.example-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--accent-subtle), transparent);
  opacity: 0;
  transition: opacity 0.25s;
}

.example-btn:hover::before {
  opacity: 1;
}

.example-btn:hover {
  border-color: var(--accent-border);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.15);
}

.example-btn:active {
  transform: translateY(0) scale(0.97);
}

.example-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.example-btn.highlight {
  background: var(--accent-subtle);
  border-color: var(--accent-border);
  color: var(--accent);
}

.example-btn.highlight:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 4px 16px rgba(88, 166, 255, 0.3);
}

.message {
  max-width: 78%;
  padding: 0.85rem 1.1rem;
  border-radius: 14px;
  font-size: 0.92rem;
  line-height: 1.65;
  white-space: pre-wrap;
  letter-spacing: 0.01em;
}

.message.user {
  align-self: flex-end;
  background: var(--user-msg-bg);
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  animation: userSlideIn 0.3s ease-out;
}

@keyframes userSlideIn {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}

/* 连续同角色消息：微妙区分 */
.message.user + .message.user,
.message.system + .message.system {
  margin-top: -0.3rem;
}

.message.user + .message.user {
  background: var(--user-msg-bg);
}

.message.system + .message.system {
  background: var(--bg-tertiary);
  border-color: var(--border-subtle);
  border-left-color: var(--warning-border);
}

/* 移动端消息宽度限制 */
@media (max-width: 640px) {
  .message {
    max-width: min(85vw, 400px);
  }

  .build-progress {
    max-width: min(85vw, 400px);
  }
}

.message.system {
  align-self: flex-start;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--warning);
  border-bottom-left-radius: 4px;
  font-size: 0.88rem;
  line-height: 1.6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* AI assistant response */
.message.assistant {
  align-self: flex-start;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.message.assistant:first-child {
  animation: assistantFadeIn 0.5s ease-out;
}

@keyframes assistantFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message.system :deep(.message-content) {
  color: var(--text-primary);
}

.message.system .message-content :deep(p) {
  margin-bottom: 0.5rem;
}

.message.system .message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message.system .message-content :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

/* 错误恢复操作栏 */
.recovery-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--warning-tint);
  border: 1px solid var(--warning-border);
  border-radius: 10px;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  backdrop-filter: blur(4px);
}
.recovery-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-right: 0.25rem;
  font-weight: 500;
  white-space: nowrap;
}
.recovery-btn {
  padding: 0.4rem 0.85rem;
  min-height: 40px;
  font-size: 0.82rem;
  font-weight: 500;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  letter-spacing: 0.01em;
}
.recovery-btn:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 2px 8px rgba(88, 166, 255, 0.25);
}
.recovery-btn:active {
  transform: scale(0.97);
}
.recovery-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.retry-btn {
  border-color: var(--accent-border);
  color: var(--accent);
}
.retry-btn:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.direct-btn {
  border-color: var(--success-border);
  color: var(--success);
}
.direct-btn:hover {
  background: var(--success);
  color: #fff;
  border-color: var(--success);
  box-shadow: 0 2px 8px rgba(63, 185, 80, 0.25);
}
.confirm-yes {
  border-color: var(--error);
  background: var(--error-tint);
  color: var(--error);
}
.confirm-yes:hover {
  background: var(--error);
  color: #fff;
  box-shadow: 0 2px 8px rgba(248, 81, 73, 0.25);
}
.confirm-no {
  border-color: var(--text-secondary);
  color: var(--text-secondary);
}
.confirm-no:hover {
  background: var(--text-secondary);
  color: var(--bg-primary);
}
.recovery-confirm-text {
  font-size: 0.82rem;
  color: var(--warning);
  font-weight: 600;
}

.message-content {
  margin-bottom: 0.25rem;
  overflow-wrap: break-word;
  word-break: break-word;
}

.message-time {
  font-size: 0.7rem;
  opacity: 0.7;
  text-align: right;
  color: var(--text-secondary);
}

.message.user .message-time {
  color: rgba(255, 255, 255, 0.65);
}

.message.system .message-time {
  color: var(--text-secondary);
  opacity: 0.6;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 0.5rem 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: bounce 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* ── Build Progress Indicator ── */
.task-confirmation {
  align-self: flex-start;
  width: min(100%, 560px);
  padding: 1rem;
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  background: linear-gradient(135deg, var(--accent-subtle), var(--bg-secondary) 70%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.task-confirmation-header,
.task-meta,
.task-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.task-confirmation-header {
  justify-content: space-between;
  margin-bottom: 0.65rem;
}

.task-type-badge {
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
}

.task-confidence,
.task-meta {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.task-confirmation h3 {
  margin: 0 0 0.45rem;
  font-size: 1rem;
}

.task-summary,
.task-visual-summary {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.task-meta {
  margin-top: 0.65rem;
}

.task-app-field {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
}

.task-app-field input {
  width: min(100%, 320px);
  min-height: 42px;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.task-app-field input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.task-app-hint {
  margin: 0.3rem 0 0;
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.task-app-hint.error {
  color: var(--error);
}

.task-visual-summary {
  margin-top: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.task-actions {
  margin-top: 0.9rem;
}

.task-confirm-btn,
.task-edit-btn {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border-radius: 9px;
  font-weight: 600;
  cursor: pointer;
}

.task-confirm-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
}

.task-edit-btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}

.task-confirm-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px var(--accent-glow);
  transform: translateY(-1px);
}

.task-edit-btn:hover:not(:disabled) {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.task-confirm-btn:focus-visible,
.task-edit-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.task-confirm-btn:disabled,
.task-edit-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.build-progress {
  align-self: flex-start;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  max-width: 420px;
  width: 100%;
  animation: buildSlideIn 0.4s ease-out;
}

.build-progress.failed {
  border-color: var(--error);
  background: var(--error-tint);
}

@keyframes buildSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.build-progress-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 0.75rem;
}

.build-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  opacity: 0.35;
  transition: opacity 0.3s;
}

.build-step.active {
  opacity: 1;
}

.build-step.done {
  opacity: 0.7;
}

.step-icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-tertiary);
  border: 2px solid var(--border);
  transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
  color: var(--text-secondary);
}

.build-step.active .step-icon {
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
  animation: stepPulse 2s infinite;
}

.build-step.done .step-icon {
  border-color: var(--success);
  background: var(--success-tint);
}

.build-step-line {
  width: 2rem;
  height: 2px;
  background: var(--border);
  margin: 0 0.25rem;
  margin-bottom: 1.25rem;
  transition: background 0.3s;
}

.build-step-line.active {
  background: var(--accent);
}

.step-label {
  font-size: 0.65rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.build-step.active .step-label {
  color: var(--accent);
}

.build-progress-status {
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0;
}

.build-progress-status a {
  margin-left: 0.35rem;
  color: var(--accent);
  font-weight: 600;
}

.status-refresh-btn {
  min-height: 40px;
  margin: 0.65rem auto 0;
  padding: 0.45rem 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}

.status-refresh-btn:hover {
  background: var(--accent-subtle);
}

.status-refresh-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@keyframes stepPulse {
  0%, 100% { box-shadow: 0 0 4px var(--accent-glow); }
  50% { box-shadow: 0 0 12px var(--accent-glow), 0 0 20px var(--accent-glow); }
}

/* ── Sidebar status pulse for building ── */
.status-building-pulse {
  animation: statusPulse 1.5s infinite;
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.read-only-banner {
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
}

/* ── 移动端适配 ─────────────────────────────────────────── */
@media (max-width: 640px) {
  .workspace {
    flex-direction: column;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    max-width: 85vw;
    height: 100vh;
    height: 100dvh;
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
  }

  .sidebar-toggle-mobile {
    display: flex;
    position: fixed;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 201;
    width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .sidebar-close-mobile {
    display: flex;
  }

  .chat-area {
    width: 100%;
  }

  .messages {
    padding: 1rem;
    padding-top: 3.5rem;
  }

  .message {
    max-width: 90%;
  }

  .input-area {
    padding: 0.75rem;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }

  .examples button {
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
  }

  /* 移动端触控目标 ≥ 44px */
  .session-open-btn,
  .app-nav-open-btn,
  .logout-btn {
    min-width: 44px;
    min-height: 44px;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
  }

  .back-to-app-btn {
    min-height: 44px;
    padding: 0.6rem 1.2rem;
  }
}

@media (min-width: 641px) {
  .sidebar-toggle-mobile {
    display: none;
  }

  .sidebar-overlay {
    display: none;
  }
}

/* 触摸设备优化 */
@media (pointer: coarse) {
  .session-item,
  .new-chat-btn,
  .logout-btn,
  .session-open-btn,
  .sidebar-close-mobile {
    min-height: 44px;
  }

  .sidebar-toggle-mobile {
    min-width: 44px;
    min-height: 44px;
  }
}

.task-confirmation:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

</style>
