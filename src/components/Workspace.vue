<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSessionStore } from '../stores/session'
import { usePolling } from '../composables/usePolling'
import { chatWithStepFun } from '../composables/useStepFun'
import { getSystemPrompt } from '../composables/useSystemPrompts'
import { sanitize } from '../composables/useSanitize'
import { detectCreateCommand, detectStatusCommand, detectStopCommand, detectStartCommand } from '../composables/useMockGitHub'
import { createIssue, getIssue, updateIssue } from '../composables/useGitHubAPI'
import ChatInput from './ChatInput.vue'
import type { BuildIssue, ChatSession } from '../types/app'
import { REPO_FULL_NAME, userRepoFullName } from '../config/repo'

const authStore = useAuthStore()
const sessionStore = useSessionStore()
const { start, stopAll } = usePolling()

const inputText = ref('')
const building = ref(false)
const activeIssue = ref<BuildIssue | null>(null)
const buildProgress = ref<{ step: number; label: string; issueNumber?: number } | null>(null)
const thinking = ref(false)
const stepToken = ref('')
const clarifying = ref(false)
const clarifyingMsg = ref('')
const triageLog = ref<string[]>([])
const pendingBuildContext = ref('')
const sidebarOpen = ref(false)
const sessionSearch = ref('')

// Map store messages to template shape
const displayMessages = computed(() =>
  sessionStore.messages.map(m => ({
    role: m.role,
    text: m.content,
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

// 应用会话聚类（open only）
const clusteredAppGroups = computed<AppGroup[]>(() => {
  const appSessions = sessionStore.groupedSessions.app.filter(s => s.status !== 'closed')
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

// 会话图标
function getSessionIcon(session: ChatSession): string {
  if (session.labels?.includes('platform')) return '🧬'
  if (session.appLabel) return '📱'
  return '💬'
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

// ─── 分流协议 ───────────────────────────────────────────
type TriageAction = 'chat' | 'build' | 'platform' | 'clarify'

interface TriageResult {
  action: TriageAction
  scenario: 'platform' | 'app_create' | 'app_iterate'
  intent: 'question' | 'create_app' | 'modify_platform' | 'unknown'
  complexity: 'simple' | 'medium' | 'complex'
  scope: 'none' | 'apps-only' | 'platform'
  basedOn?: string
}

const TRIAGE_LABELS: Record<string, string> = {
  chat: '直接回复', build: 'Agent Loop', platform: 'Issue+审核', clarify: '澄清',
}
const INTENT_LABELS: Record<string, string> = {
  question: '询问', create_app: '创建应用', modify_platform: '修改平台', unknown: '未知',
}

function triageMessage(text: string): TriageResult {
  const lower = text.toLowerCase()

  // 平台关键词 — Mitosis 自身变更（动词在前或 mito 在后均可）
  const isPlatform =
    /src\//i.test(text) ||
    /mitosis\s*(支持|增加|去掉|删除|修改|优化|改进|加个|加上|升级|重构)/i.test(text) ||
    /(?:给|帮|让)\s*mitosis\s*(加|增加|加个|去掉|删|改|优化|升级|支持)/i.test(text) ||
    /(?:GitHub Actions|workflow|CI|OAuth|认证|deploy|gh-pages|composable|组件库|架构|核心逻辑)/.test(text) ||
    /(?:Workspace|SetupPage|Gallery|ChatInput)/.test(text)

  // 询问关键词
  const isQuestion =
    /^(?:怎么|如何|为什么|是什么|能不能|可以|帮忙|help|how|what|why)/.test(lower) ||
    /[?？]$/.test(text.trim()) ||
    /(?:进度|状态|帮助|介绍|解释|说明|区别|是什么)/.test(text)

  // 创建应用关键词（扩展：直接点名游戏/应用名也视为创建意图）
  const isAppBuild =
    /(?:做一个|创建.*应用|建.*应用|写.*应用|开发.*应用|实现.*应用|做个|搞个|弄个|做个游戏|做个工具|想做个|想做一个)/.test(text) ||
    /(?:build|create.*app|make.*app|new app)/i.test(lower) ||
    /^(?:俄罗斯方块|贪吃蛇|snake|tetris|todo|计算器|calculator|俄罗斯|打砖块|breakout|flappy|2048).*$/i.test(text.trim())

  // 简单微调关键词（R2：直接回复，不创建 Issue）
  const isSimpleTweak =
    /(?:改.*颜色|改.*字体|改.*大小|调.*大|调.*小|加.*文字|改.*样式|换个.*图标|加.*按钮|改.*背景|字体|颜色|间距|圆角|阴影)/.test(text)

  // "继续迭代"关键词
  const isContinue = /(?:继续|上次|迭代|在.*基础上|基于.*继续)/.test(text)

  // 提取"基于哪个应用"
  let basedOn: string | undefined
  const m = text.match(/(?:在|基于)\s*([a-z0-9-]+)\s*(?:的?基础上|之上)/i)
  if (m) basedOn = m[1].toLowerCase()

  // R4/R5: 平台变更（优先于 question，避免 "mitosis 支持 xxx" 被误分类）
  if (isPlatform) {
    return { action: 'platform', scenario: 'platform', intent: 'modify_platform', complexity: 'medium', scope: 'platform' }
  }
  // R3: 应用构建（新建 or 复杂修改 or 继续迭代）
  // 注意：isAppBuild 必须在 isQuestion 之前检查，避免 "做一个游戏" 被误判为问题
  if (isAppBuild || isContinue) {
    const scenario = basedOn ? 'app_iterate' : 'app_create'
    return {
      action: 'build',
      scenario,
      intent: 'create_app',
      complexity: isContinue || basedOn ? 'medium' : 'complex',
      scope: 'apps-only',
      basedOn,
    }
  }
  // R2: 已有应用的简单微调
  if (isSimpleTweak && !isContinue) {
    return { action: 'chat', scenario: 'app_iterate', intent: 'create_app', complexity: 'simple', scope: 'apps-only', basedOn }
  }
  // R1: 纯询问（无构建意图，无平台范围）
  if (isQuestion && !isAppBuild && !isPlatform && !isContinue) {
    return { action: 'chat', scenario: 'app_create', intent: 'question', complexity: 'simple', scope: 'none' }
  }
  // R6: 无法确定 → 澄清
  return { action: 'clarify', scenario: 'app_create', intent: 'unknown', complexity: 'simple', scope: 'none' }
}

function logTriage(text: string, t: TriageResult) {
  const summary = text.length > 30 ? text.slice(0, 30) + '…' : text
  const log = `[TRIAGE] 消息: "${summary}" | 意图: ${INTENT_LABELS[t.intent]} | 决策: ${TRIAGE_LABELS[t.action]}${t.basedOn ? ' | based-on: ' + t.basedOn : ''}`
  console.log(log)
  triageLog.value.push(log)
}

const repo = computed(() => authStore.user?.login ? userRepoFullName(authStore.user.login) : REPO_FULL_NAME)
const isOwner = computed(() => !!authStore.user?.login && authStore.setupComplete)

onMounted(async () => {
  if (typeof window !== 'undefined') {
    stepToken.value = localStorage.getItem('mitosis_step_token') || ''
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
})

// 移动端侧边栏打开时锁定背景滚动
watch(sidebarOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : ''
  }
}, { flush: 'post' })

function getConversationHistory() {
  return sessionStore.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}

async function handleSend() {
  if (!isOwner.value) return
  if (sessionStore.activeSession?.status === 'closed') return
  const text = inputText.value.trim()
  if (!text || building.value || !authStore.token) return

  // ── /create 命令：直接触发构建，跳过 StepFun ──
  const createCmd = detectCreateCommand(text)
  if (createCmd.triggered) {
    const rawDescription = createCmd.description || text
    // Strip command prefix for app name extraction
    const description = rawDescription.replace(/^\/create\s+/, '').trim() || rawDescription
    const appName = extractAppName(description)
    sessionStore.addMessage({
      role: 'user',
      content: text,
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
  const statusCmd = detectStatusCommand(text)
  if (statusCmd.triggered) {
    const statusResult = await sessionStore.checkAgentStatus(authStore.token, REPO_FULL_NAME, sessionStore.activeSession!.issueNumber)
    sessionStore.addMessage({
      role: 'user',
      content: text,
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
  const stopCmd = detectStopCommand(text)
  if (stopCmd.triggered) {
    const session = sessionStore.activeSession!
    await updateIssue(authStore.token, REPO_FULL_NAME, session.issueNumber, 'closed', [...session.labels, 'status:cancelled'])
    sessionStore.addMessage({
      role: 'user',
      content: text,
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
  const startCmd = detectStartCommand(text)
  if (startCmd.triggered) {
    const session = sessionStore.activeSession!
    await updateIssue(authStore.token, REPO_FULL_NAME, session.issueNumber, 'open', session.labels.filter((l: string) => l !== 'status:cancelled'))
    sessionStore.addMessage({
      role: 'user',
      content: text,
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
    content: text,
    createdAt: new Date().toISOString(),
  })
  inputText.value = ''
  thinking.value = true

  try {
    // ── 1. 分流 ──
    const triage = triageMessage(text)
    logTriage(text, triage)

    // ── 2. 澄清（R6）──
    if (triage.action === 'clarify') {
      clarifying.value = true
      // 保存原始上下文，澄清回答时合并使用
      if (!pendingBuildContext.value && text) {
        pendingBuildContext.value = text
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
      return
    }

    // ── 3. 分流执行 ──
    // R3 build：直接创建构建，不再依赖 StepFun 输出 BUILD_APP 标记
    // 这样即使模型未按 prompt 输出标记，也能正确触发构建
    if (triage.action === 'build') {
      const appName = extractAppName(text)
      const description = previousBuildContext
        ? `${previousBuildContext}\n\n## 澄清回答\n\n${text}`
        : text
      pendingBuildContext.value = ''
      await createBuild(appName, description, triage.basedOn, triage.scenario)
      return
    }

    // R4/R5 platform + R1/R2 chat：调用 StepFun 生成回复
    const history = getConversationHistory()
    const systemPrompt = getSystemPrompt(triage, authStore.user?.login)

    const response = await chatWithStepFun(stepToken.value, history, { system: systemPrompt })
    const trimmed = response.trim()

    sessionStore.addMessage({
      role: 'assistant',
      content: trimmed,
      createdAt: new Date().toISOString(),
    })

    // platform 需要 BUILD_PLATFORM 标记才触发构建
    if (triage.action === 'platform') {
      const platformMatch = trimmed.match(/BUILD_PLATFORM:\s*(.+)/i)
      if (platformMatch) {
        await createPlatformBuild(text, platformMatch[1].trim())
      }
    }
    // chat/其他：如果 AI 输出 BUILD_APP 标记，自动创建构建任务
    const buildMatch = trimmed.match(/BUILD_APP:\s*(.+)/i)
    if (buildMatch) {
      const appName = extractAppName(buildMatch[1].trim())
      await createBuild(appName, buildMatch[1].trim())
    }
    // chat (R1/R2): 直接回复，无需进一步操作
  } catch (e) {
    sessionStore.addMessage({
      role: 'system',
      content: `❌ 请求失败: ${e instanceof Error ? e.message : '未知错误'}`,
      createdAt: new Date().toISOString(),
    })
  } finally {
    thinking.value = false
  }
}

async function createBuild(appName: string, description: string, basedOn?: string, scenario?: 'platform' | 'app_create' | 'app_iterate') {
  if (building.value || !authStore.token || !isOwner.value) return

  building.value = true
  activeIssue.value = null
  buildProgress.value = { step: 0, label: '分析需求...' }
  const version = basedOn ? 'v1' : 'v0'
  // scenario 优先于 basedOn 推断标签
  const effectiveScenario = scenario || (basedOn ? 'app_iterate' : 'app_create')
  const labels = effectiveScenario === 'app_iterate' ? [`app/${appName}`, 'update'] : [`app/${appName}`]
  const basedOnLine = basedOn ? `\n- 基于: ${basedOn}` : ''
  const body = `## 需求描述\n\n${description}${basedOn ? `\n\n## 基于现有应用\n\n基于应用: ${basedOn}` : ''}\n\n## 构建信息\n\n- 应用名称: ${appName}\n- 版本: ${version}\n- 触发方式: Web 界面${basedOnLine}`

  try {
    const token = authStore.token!
    const issue = await createIssue(token, repo.value, `build: ${appName} ${version}`, body, labels)

    sessionStore.addMessage({
      role: 'system',
      content: `📝 已创建构建任务 #${issue.number} — ${appName} ${version}\n正在启动构建流程...`,
      createdAt: new Date().toISOString(),
    })

    start(issue.number, () => getIssue(token, repo.value, issue.number), onIssueUpdate)
  } catch (e) {
    const err = e instanceof Error ? e : new Error('未知错误')
    const statusMatch = err.message.match(/(\d{3})/)
    const status = statusMatch?.[1]
    const repoFull = repo.value
    const title = `build: ${appName} ${version}`
    const encodedBody = encodeURIComponent(`## 需求描述\n\n${description}${basedOn ? `\n\n## 基于现有应用\n\n基于应用: ${basedOn}` : ''}`)
    const fallbackUrl = `https://github.com/${repoFull}/issues/new?title=${encodeURIComponent(title)}&body=${encodedBody}&labels=app/${appName}`

    const fallbackMsg = status === '403'
      ? `⚠️ 当前 Token 无仓库写入权限（403），无法自动创建构建任务。\n\n请点击下方链接手动创建 Issue（已预填内容），创建后 CI 将自动构建：\n[在 GitHub 上创建构建任务](${fallbackUrl})`
      : `❌ 创建任务失败: ${err.message}`

    sessionStore.addMessage({
      role: 'system',
      content: fallbackMsg,
      createdAt: new Date().toISOString(),
    })
    building.value = false
  }
  // 刷新会话列表（新创建的 Issue 需要重新加载）
  await sessionStore.loadSessions(authStore.token!, repo.value)
}

// 平台变更直接构建（模型判断可执行时触发）
async function createPlatformBuild(originalText: string, description: string) {
  if (building.value || !authStore.token || !isOwner.value) return

  building.value = true
  activeIssue.value = null
  const title = `platform: ${originalText.slice(0, 60)}${originalText.length > 60 ? '…' : ''}`
  const body = `## 需求描述\n\n${description}\n\n## 构建信息\n\n- 触发方式: Web 界面（AI 判断可直接执行）`

  try {
    const token = authStore.token!
    const issue = await createIssue(token, repo.value, title, body, ['platform'])

    sessionStore.addMessage({
      role: 'system',
      content: `🔨 已创建平台构建任务 #${issue.number}，CI 将自动构建。\n查看: https://github.com/${repo.value}/issues/${issue.number}`,
      createdAt: new Date().toISOString(),
    })

    start(issue.number, () => getIssue(token, repo.value, issue.number), onIssueUpdate)
  } catch (e) {
    const err = e instanceof Error ? e : new Error('未知错误')
    const statusMatch = err.message.match(/(\d{3})/)
    const status = statusMatch?.[1]
    const repoFull = repo.value
    const encodedBody = encodeURIComponent(`## 需求描述\n\n${description}\n\n## 构建信息\n\n- 触发方式: Web 界面（AI 判断可直接执行）`)
    const fallbackUrl = `https://github.com/${repoFull}/issues/new?title=${encodeURIComponent(title)}&body=${encodedBody}&labels=platform`

    const fallbackMsg = status === '403'
      ? `⚠️ 当前 Token 无仓库写入权限（403），无法自动创建平台构建任务。\n\n请点击下方链接手动创建：\n[在 GitHub 上创建 Issue](${fallbackUrl})`
      : `❌ 创建平台构建失败: ${err.message}`

    sessionStore.addMessage({
      role: 'system',
      content: fallbackMsg,
      createdAt: new Date().toISOString(),
    })
    building.value = false
  }
  // 刷新会话列表
  await sessionStore.loadSessions(authStore.token!, repo.value)
}

function onIssueUpdate(issue: BuildIssue) {
  const previousLabels = new Set(activeIssue.value?.labels.map(label => label.name) || [])
  activeIssue.value = issue
  const labels = new Set(issue.labels.map(label => label.name))
  const appName = extractAppNameFromIssue(issue)
  const version = extractVersionFromIssue(issue)
  const appUrl = `https://mitosis.zenheart.site/apps/${appName}/${version}/`
  const issueUrl = `https://github.com/${repo.value}/issues/${issue.number}`

  if (labels.has('status:review')) {
    buildProgress.value = { step: 3, label: '等待审查', issueNumber: issue.number }
    sessionStore.addMessage({
      role: 'system',
      content: `✅ ${appName} ${version} 已通过自动验证，等待人工审查。\n[前往 GitHub 审查](${issueUrl})\n合入 master 后访问: ${appUrl}`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (labels.has('status:failed')) {
    buildProgress.value = { step: -1, label: '构建失败', issueNumber: issue.number }
    sessionStore.addMessage({
      role: 'system',
      content: `❌ ${appName} ${version} 自动验证失败，请查看 [Issue #${issue.number}](${issueUrl}) 和 Actions 日志。`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (labels.has('status:verifying') && !previousLabels.has('status:verifying')) {
    buildProgress.value = { step: 2, label: '验证中', issueNumber: issue.number }
    sessionStore.addMessage({
      role: 'system',
      content: `🔎 正在验证 ${appName} ${version}... ([Issue #${issue.number}](${issueUrl}))`,
      createdAt: new Date().toISOString(),
    })
    return
  }

  if (labels.has('status:building') && !previousLabels.has('status:building')) {
    buildProgress.value = { step: 1, label: '构建中', issueNumber: issue.number }
    sessionStore.addMessage({
      role: 'system',
      content: `🔨 正在构建 ${appName} ${version}... ([Issue #${issue.number}](${issueUrl}))`,
      createdAt: new Date().toISOString(),
    })
    return
  }

  if (issue.state === 'closed') {
    buildProgress.value = { step: 4, label: '已完成', issueNumber: issue.number }
    sessionStore.addMessage({
      role: 'system',
      content: `Issue #${issue.number} 已关闭。应用版本路径: ${appUrl}`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
  }
}

function extractAppNameFromIssue(issue: BuildIssue): string {
  const appLabel = issue.labels.find(label => label.name.startsWith('app/'))?.name
  if (appLabel) return appLabel.replace(/^app\//, '')

  const titleMatch = issue.title.match(/^build:\s*([a-z0-9-]+)/i)
  return titleMatch?.[1]?.toLowerCase() || extractAppName(issue.title)
}

function extractVersionFromIssue(issue: BuildIssue): string {
  const bodyMatch = issue.body.match(/版本:\s*(v\d+)/i)
  if (bodyMatch) return bodyMatch[1].toLowerCase()

  const titleMatch = issue.title.match(/\b(v\d+)\b/i)
  return titleMatch?.[1]?.toLowerCase() || 'v0'
}

function extractAppName(input: string): string {
  const cleaned = input.toLowerCase().replace(/^\/create\s+/, '').replace(/^\/build\s+/, '')
  // 优先提取中英文应用名（俄罗斯方块、snake、tetris 等）
  const chineseMatch = cleaned.match(/([一-鿿]+(?:游戏|应用|工具|编辑器|方块|蛇|鸟|棋|牌|世界|模拟器|平台|管家|系统|大战))/)
  if (chineseMatch) return chineseMatch[1]

  const englishMatch = cleaned.match(/(?:build|create|make|new)\s+([a-z0-9-]+)/i) ||
                       cleaned.match(/(snake|tetris|todo|calculator|breakout|flappy|2048|pong|paint|chat|doodle|pixel)/i)
  if (englishMatch) return englishMatch[1].toLowerCase()

  const slug = cleaned.toLowerCase().replace(/[^a-z0-9一-龥]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (/^-+$/.test(slug)) return 'my-app'
  return slug || 'my-app'
}

async function navigateToSession(session: ChatSession) {
  // RESTful: URL query 参数记录会话状态
  const url = new URL(window.location.href)
  url.searchParams.set('session', String(session.issueNumber))
  window.history.pushState({}, '', url.toString())
  await loadSession(session)
}

async function loadSession(session: ChatSession, autoOpenApp = false) {
  sessionStore.setActiveSession(session)
  await sessionStore.loadMessages(authStore.token!, repo.value, session.issueNumber)
  inputText.value = ''
  // 从 URL ?session= 恢复时，如果会话关联了应用，自动打开应用页面
  if (autoOpenApp && session.appLabel) {
    openAppSession(session)
  }
}

function openAppSession(session: ChatSession) {
  const appName = session.appLabel?.replace('app/', '') || ''
  // 从 title 或 body 提取版本，默认 v0
  const versionMatch = session.title.match(/v(\d+)/i)
  const version = versionMatch ? `v${versionMatch[1]}` : 'v0'
  if (appName) {
    window.open(`/apps/${appName}/${version}/`, '_blank')
  }
}

function handleNewChat() {
  stopAll()
  sessionStore.setActiveSession(null)
  activeIssue.value = null
  buildProgress.value = null
  building.value = false
  clarifying.value = false
  clarifyingMsg.value = ''
  pendingBuildContext.value = ''
  triageLog.value = []
}
</script>

<template>
  <div class="workspace">
    <!-- 移动端侧边栏遮罩 -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>
    <!-- 移动端侧边栏开关 -->
    <button class="sidebar-toggle-mobile" @click="sidebarOpen = !sidebarOpen">☰</button>
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <h2>🧬 Mitosis</h2>
        <div class="user-info">
          <img v-if="authStore.user?.avatar_url" :src="authStore.user.avatar_url" class="avatar" />
          <span class="username">{{ authStore.user?.login }}</span>
          <button @click="authStore.logout" class="logout-btn" title="退出登录">⏻</button>
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
            <div
              v-for="session in searchResults"
              :key="session.issueNumber"
              class="session-item"
              tabindex="0"
              role="button"
              :class="{
                active: sessionStore.activeSession?.issueNumber === session.issueNumber,
                closed: session.status === 'closed'
              }"
              @click="navigateToSession(session)"
              @keydown.enter="navigateToSession(session)"
            >
              <span class="session-icon">{{ getSessionIcon(session) }}</span>
              <span class="session-title">{{ session.title }}</span>
              <span class="session-status" :class="statusClass(session)">{{ sessionStore.getSessionDisplayStatus(session) }}</span>
            </div>
          </div>
          <div v-else class="no-results">未找到匹配的会话</div>
        </template>

        <!-- 正常模式：平台 + 应用分组 -->
        <template v-else>
          <!-- 平台会话（open only） -->
          <template v-if="platformSessions.length">
            <div class="session-group-label">🧬 平台</div>
            <div
              v-for="session in platformSessions"
              :key="session.issueNumber"
              class="session-item"
              tabindex="0"
              role="button"
              :class="{ active: sessionStore.activeSession?.issueNumber === session.issueNumber }"
              @click="navigateToSession(session)"
              @keydown.enter="navigateToSession(session)"
            >
              <span class="session-title">{{ session.title }}</span>
              <span class="session-status" :class="statusClass(session)">{{ sessionStore.getSessionDisplayStatus(session) }}</span>
            </div>
          </template>

          <!-- 应用会话：按 app name 聚类，只显示 open -->
          <template v-if="clusteredAppGroups.length">
            <div class="session-group-label">📱 我的应用</div>
            <div
              v-for="group in clusteredAppGroups"
              :key="group.appName"
              class="session-item app-group"
              tabindex="0"
              role="button"
              :class="{ active: sessionStore.activeSession?.issueNumber === group.latest.issueNumber }"
              @click="navigateToSession(group.latest)"
              @keydown.enter="navigateToSession(group.latest)"
            >
              <span class="session-icon">📱</span>
              <span class="session-title">{{ group.appName }}</span>
              <span class="session-count">{{ group.sessions.length }} 次迭代</span>
              <span class="session-status" :class="statusClass(group.latest)">{{ sessionStore.getSessionDisplayStatus(group.latest) }}</span>
              <button class="session-open-btn" @click.stop="openAppSession(group.latest)" title="打开应用">打开</button>
            </div>
          </template>
        </template>
      </div>
    </aside>
    <main class="chat-area">
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
          <h3>👋 你好，{{ authStore.user?.login }}</h3>
          <p>描述你想做的事情，AI 会自动判断是构建应用还是平台变更。</p>
          <div class="examples">
            <button @click="inputText = '帮我做一个俄罗斯方块游戏，支持消行和计分'">🎮 俄罗斯方块</button>
            <button @click="inputText = '帮我做一个 todo 应用，支持添加、删除和标记完成'">📝 Todo 应用</button>
            <button @click="inputText = '帮我做一个计算器，支持加减乘除'">🔢 计算器</button>
            <button @click="inputText = '在 tetris-game 的基础上加一个关卡系统'">🧬 继续迭代</button>
            <button @click="inputText = '优化 Workspace 的聊天界面性能'">⚙️ 平台优化</button>
            <button @click="inputText = 'Mitosis 目前的技术栈是什么？'">💬 咨询问题</button>
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
        <!-- 构建进度指示器 -->
        <div v-if="buildProgress" class="build-progress">
          <div class="build-progress-steps">
            <div class="build-step" :class="{ active: buildProgress.step >= 0, done: buildProgress.step > 0 }">
              <span class="step-icon">📋</span>
              <span class="step-label">分析</span>
            </div>
            <div class="build-step-line" :class="{ active: buildProgress.step >= 1 }"></div>
            <div class="build-step" :class="{ active: buildProgress.step >= 1, done: buildProgress.step > 1 }">
              <span class="step-icon">🔨</span>
              <span class="step-label">构建</span>
            </div>
            <div class="build-step-line" :class="{ active: buildProgress.step >= 2 }"></div>
            <div class="build-step" :class="{ active: buildProgress.step >= 2, done: buildProgress.step > 3 }">
              <span class="step-icon">🔎</span>
              <span class="step-label">验证</span>
            </div>
            <div class="build-step-line" :class="{ active: buildProgress.step >= 3 }"></div>
            <div class="build-step" :class="{ active: buildProgress.step >= 3 }">
              <span class="step-icon">✅</span>
              <span class="step-label">审查</span>
            </div>
          </div>
          <p class="build-progress-status">{{ buildProgress.label }}</p>
        </div>
      </div>
      <!-- 活跃会话的应用导航栏 -->
      <div v-if="sessionStore.activeSession?.appLabel" class="app-nav-bar">
        <span class="app-nav-label">📱 {{ sessionStore.activeSession.appLabel.replace('app/', '') }}</span>
        <button @click="openAppSession(sessionStore.activeSession)" class="app-nav-open-btn">打开应用 →</button>
      </div>
      <ChatInput
        v-model="inputText"
        :is-owner="isOwner"
        :thinking="thinking"
        :building="building"
        @send="handleSend"
      />
    </main>
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h2 {
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
  background: linear-gradient(135deg, #58a6ff, #00e5ff, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: brandShift 8s ease-in-out infinite;
  background-size: 200% 200%;
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
  font-size: 1rem;
  padding: 0.25rem;
  transition: color 0.2s;
}

.logout-btn:hover {
  color: var(--error);
}

.nav {
  padding: 0.75rem;
}

.new-chat-btn {
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent);
}

.sessions-list {
  padding: 0 0.75rem;
  margin-top: 0.25rem;
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
  padding: 0.4rem 0.6rem 0.4rem 1.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.8rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.session-item {
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 2px;
  transition: background 0.15s;
  overflow: hidden;
}

.session-item.app-session {
  cursor: default;
}

.session-item.closed {
  opacity: 0.55;
}

.session-group-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.35rem 0.5rem 0.1rem;
  letter-spacing: 0.03em;
}

.session-count {
  font-size: 0.65rem;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.session-status {
  font-size: 0.7rem;
  flex-shrink: 0;
  color: var(--text-secondary);
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--bg-tertiary);
}

.status-active {
  color: var(--success);
  background: rgba(63, 185, 80, 0.1);
}

.status-review {
  color: #d29922;
  background: rgba(210, 153, 34, 0.1);
}

.status-error {
  color: var(--error);
  background: rgba(248, 81, 73, 0.1);
}

.status-closed {
  color: var(--text-secondary);
  opacity: 0.6;
}

.session-open-btn {
  margin-left: auto;
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.session-open-btn:hover {
  background: var(--accent);
  color: #fff;
}

.session-item:hover {
  background: var(--bg-tertiary);
}

.session-icon {
  font-size: 0.9rem;
  width: 1.5rem;
  text-align: center;
  flex-shrink: 0;
}

.session-item.active {
  background: var(--bg-tertiary);
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
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: #555;
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
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.app-nav-label {
  color: var(--text-primary);
  font-weight: 500;
}

.app-nav-open-btn {
  padding: 0.35rem 0.75rem;
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.app-nav-open-btn:hover {
  background: var(--accent);
  color: #fff;
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
  transition: all 0.2s;
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
  padding: 2rem;
}

.welcome.session-welcome {
  margin-top: 4rem;
}

.welcome.session-welcome h3 {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.welcome.session-welcome .hint-text {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.welcome h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.welcome p {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.examples button {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: all 0.2s;
}

.examples button:hover {
  border-color: var(--accent);
  background: var(--bg-tertiary);
}

.message {
  max-width: 80%;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.message.user {
  align-self: flex-end;
  background: linear-gradient(135deg, #58a6ff, #79c0ff);
  color: #fff;
  border-bottom-right-radius: 4px;
}

/* 连续同角色消息：微妙区分 */
.message.user + .message.user,
.message.system + .message.system {
  margin-top: -0.25rem;
}

.message.user + .message.user {
  background: linear-gradient(135deg, #4790e8, #68afef);
}

.message.system + .message.system {
  background: #1a1f26;
  border-color: #3a3f46;
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
  border-bottom-left-radius: 4px;
}

.message-content {
  margin-bottom: 0.25rem;
}

.message-time {
  font-size: 0.7rem;
  opacity: 0.7;
  text-align: right;
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
  font-size: 1.1rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-tertiary);
  border: 2px solid var(--border);
  transition: all 0.3s;
}

.build-step.active .step-icon {
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
  animation: stepPulse 2s infinite;
}

.build-step.done .step-icon {
  border-color: var(--success);
  background: rgba(63, 185, 80, 0.1);
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
    font-size: 1.25rem;
    cursor: pointer;
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
  .session-open-btn {
    min-height: 44px;
  }

  .sidebar-toggle-mobile {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
