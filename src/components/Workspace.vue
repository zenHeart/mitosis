<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSessionStore } from '../stores/session'
import { usePolling } from '../composables/usePolling'
import { chatWithStepFun } from '../composables/useStepFun'
import { sanitize } from '../composables/useSanitize'
import { detectCreateCommand } from '../composables/useMockGitHub'
import { createIssue, getIssue } from '../composables/useGitHubAPI'
import ChatInput from './ChatInput.vue'
import type { BuildIssue, ChatSession } from '../types/app'
import { REPO_FULL_NAME, userRepoFullName } from '../config/repo'

const authStore = useAuthStore()
const sessionStore = useSessionStore()
const { start, stopAll } = usePolling()

const inputText = ref('')
const building = ref(false)
const activeIssue = ref<BuildIssue | null>(null)
const thinking = ref(false)
const stepToken = ref('')
const clarifying = ref(false)
const clarifyingMsg = ref('')
const triageLog = ref<string[]>([])
const pendingBuildContext = ref('')

// Map store messages to template shape
const displayMessages = computed(() =>
  sessionStore.messages.map(m => ({
    role: m.role,
    text: m.content,
    time: new Date(m.createdAt).toLocaleTimeString(),
  }))
)

// ─── 分流协议 ───────────────────────────────────────────
type TriageAction = 'chat' | 'build' | 'platform' | 'clarify'

interface TriageResult {
  action: TriageAction
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

  // 平台关键词 — 触及 src/、CI、认证、部署、Mitosis 自身
  const isPlatform =
    /src\//i.test(text) ||
    /mitosis 本身|mitosis 平台|优化 Mitosis|改进 Mitosis/.test(text) ||
    /(?:GitHub Actions|workflow|CI|OAuth|认证|deploy|gh-pages|composable|组件库|架构|核心逻辑)/.test(text) ||
    /(?:Workspace|SetupPage|Gallery|ChatInput)/.test(text)

  // 询问关键词
  const isQuestion =
    /^(?:怎么|如何|为什么|是什么|能不能|可以|帮忙|help|how|what|why)/.test(lower) ||
    /[?？]$/.test(text.trim()) ||
    /(?:进度|状态|帮助|介绍|解释|说明|区别|是什么)/.test(text)

  // 创建应用关键词
  const isAppBuild =
    /(?:做一个|创建.*应用|建.*应用|写.*应用|开发.*应用|实现.*应用|做个|搞个|弄个|做个游戏|做个工具)/.test(text) ||
    /(?:build|create.*app|make.*app|new app)/i.test(lower)

  // 简单微调关键词（R2：直接回复，不创建 Issue）
  const isSimpleTweak =
    /(?:改.*颜色|改.*字体|改.*大小|调.*大|调.*小|加.*文字|改.*样式|换个.*图标|加.*按钮|改.*背景|字体|颜色|间距|圆角|阴影)/.test(text)

  // "继续迭代"关键词
  const isContinue = /(?:继续|上次|迭代|在.*基础上|基于.*继续)/.test(text)

  // 提取"基于哪个应用"
  let basedOn: string | undefined
  const m = text.match(/(?:在|基于)\s*([a-z0-9-]+)\s*(?:的?基础上|之上)/i)
  if (m) basedOn = m[1].toLowerCase()

  // ── 分流决策 ──
  // R1: 纯询问（无构建意图，无平台范围）
  if (isQuestion && !isAppBuild && !isPlatform && !isContinue) {
    return { action: 'chat', intent: 'question', complexity: 'simple', scope: 'none' }
  }
  // R4/R5: 平台变更
  if (isPlatform) {
    return { action: 'platform', intent: 'modify_platform', complexity: 'medium', scope: 'platform' }
  }
  // R2: 已有应用的简单微调
  if (isSimpleTweak && !isAppBuild && !isContinue) {
    return { action: 'chat', intent: 'create_app', complexity: 'simple', scope: 'apps-only', basedOn }
  }
  // R3: 应用构建（新建 or 复杂修改 or 继续迭代）
  if (isAppBuild || isContinue) {
    return {
      action: 'build',
      intent: 'create_app',
      complexity: isContinue || basedOn ? 'medium' : 'complex',
      scope: 'apps-only',
      basedOn,
    }
  }
  // R6: 无法确定 → 澄清
  return { action: 'clarify', intent: 'unknown', complexity: 'simple', scope: 'none' }
}

function logTriage(text: string, t: TriageResult) {
  const summary = text.length > 30 ? text.slice(0, 30) + '…' : text
  const log = `[TRIAGE] 消息: "${summary}" | 意图: ${INTENT_LABELS[t.intent]} | 决策: ${TRIAGE_LABELS[t.action]}${t.basedOn ? ' | based-on: ' + t.basedOn : ''}`
  console.log(log)
  triageLog.value.push(log)
}

// ── 系统 Prompt 模板 ──
function chatSystemPrompt(): string {
  return `你是 Mitosis 平台的助手。用户正在和你聊天或询问问题。
简短、友好地回答。如果用户只是打招呼，正常回应即可。
当前时间: ${new Date().toLocaleString('zh-CN')}`
}

function buildSystemPrompt(triage: TriageResult): string {
  const basedOnHint = triage.basedOn
    ? `\n用户想在 ${triage.basedOn} 的基础上继续开发。Issue 中请包含 based-on 信息。`
    : ''
  return `你是一个应用构建助手。用户想构建或迭代一个应用。
请：
1. 理解用户需求
2. 给出简短的技术方案概述（2-3 句话）
3. 如果需求足够明确，在回复末尾加一行：BUILD_APP: [应用英文名]
   应用名用英文小写短横线连接，不要有空格${basedOnHint}

如果需求还不明确需要更多信息，先问清楚，不要加 BUILD_APP。
当前时间: ${new Date().toLocaleString('zh-CN')}`
}

function platformSystemPrompt(): string {
  return `用户提到了 Mitosis 平台本身的修改（涉及 src/、CI、认证、部署等平台代码）。
你的任务：
1. 分析这个修改的影响范围和注意事项
2. 给出技术建议
3. 如果用户明确要求执行修改，在回复末尾加一行：BUILD_PLATFORM: [简述修改内容]
   这样系统会自动创建 Issue 并触发 CI 构建流程。
   如果只是讨论/分析，不要加 BUILD_PLATFORM 标记。

请正常回复分析。
当前时间: ${new Date().toLocaleString('zh-CN')}`
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
          await loadSession(session)
        }
      }
    }
  }
  if (authStore.token) {
    await sessionStore.loadSessions(authStore.token, repo.value)
  }
})

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
    const description = createCmd.description || text
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

    // ── 3. 调用 StepFun ──
    const history = getConversationHistory()
    const systemPrompt =
      triage.action === 'chat'
        ? chatSystemPrompt()
        : triage.action === 'build'
          ? buildSystemPrompt(triage)
          : platformSystemPrompt()

    const response = await chatWithStepFun(stepToken.value, [
      { role: 'system' as const, content: systemPrompt },
      ...history,
    ])
    const trimmed = response.trim()

    sessionStore.addMessage({
      role: 'assistant',
      content: trimmed,
      createdAt: new Date().toISOString(),
    })

    // ── 4. 根据分流结果执行 ──
    if (triage.action === 'build') {
      // R3: 检查 BUILD_APP 标记 → 创建 Issue → 触发 CI
      const buildMatch = trimmed.match(/BUILD_APP:\s*([a-z0-9-]+)/i)
      if (buildMatch) {
        const appName = buildMatch[1].toLowerCase()
        const description = previousBuildContext
          ? `${previousBuildContext}\n\n## 澄清回答\n\n${text}`
          : text
        pendingBuildContext.value = ''
        await createBuild(appName, description, triage.basedOn)
      } else {
        clarifying.value = true
        pendingBuildContext.value = previousBuildContext
          ? `${previousBuildContext}\n\n## 用户补充\n\n${text}\n\n## AI 澄清\n\n${trimmed}`
          : `## 初始需求\n\n${text}\n\n## AI 澄清\n\n${trimmed}`
      }
    } else if (triage.action === 'platform') {
      const platformMatch = trimmed.match(/BUILD_PLATFORM:\s*(.+)/i)
      if (platformMatch) {
        await createPlatformBuild(text, platformMatch[1].trim())
      }
    }
    // R1/R2 (chat): 直接回复，无需进一步操作
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

async function createBuild(appName: string, description: string, basedOn?: string) {
  if (building.value || !authStore.token || !isOwner.value) return

  building.value = true
  activeIssue.value = null
  const version = basedOn ? 'v1' : 'v0'
  const labels = basedOn ? [`app/${appName}`, 'update'] : [`app/${appName}`]
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
}

function onIssueUpdate(issue: BuildIssue) {
  const previousLabels = new Set(activeIssue.value?.labels.map(label => label.name) || [])
  activeIssue.value = issue
  const labels = new Set(issue.labels.map(label => label.name))
  const appName = extractAppNameFromIssue(issue)
  const version = extractVersionFromIssue(issue)
  const appUrl = `https://mitosis.zenheart.site/apps/${appName}/${version}/`

  if (labels.has('status:review')) {
    sessionStore.addMessage({
      role: 'system',
      content: `✅ ${appName} ${version} 已通过自动验证，等待人工审查。\n合入 master 后访问: ${appUrl}`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (labels.has('status:failed')) {
    sessionStore.addMessage({
      role: 'system',
      content: `❌ ${appName} ${version} 自动验证失败，请查看 Issue #${issue.number} 和 Actions 日志。`,
      createdAt: new Date().toISOString(),
    })
    building.value = false
    stopAll()
    return
  }

  if (labels.has('status:verifying') && !previousLabels.has('status:verifying')) {
    sessionStore.addMessage({
      role: 'system',
      content: `🔎 正在验证 ${appName} ${version}... (Issue #${issue.number})`,
      createdAt: new Date().toISOString(),
    })
    return
  }

  if (labels.has('status:building') && !previousLabels.has('status:building')) {
    sessionStore.addMessage({
      role: 'system',
      content: `🔨 正在构建 ${appName} ${version}... (Issue #${issue.number})`,
      createdAt: new Date().toISOString(),
    })
    return
  }

  if (issue.state === 'closed') {
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
  const cleaned = input.toLowerCase().replace(/[^a-z0-9一-龥]/g, '-')
  const collapsed = cleaned.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return collapsed || 'my-app'
}

async function navigateToSession(session: ChatSession) {
  // RESTful: URL query 参数记录会话状态
  const url = new URL(window.location.href)
  url.searchParams.set('session', String(session.issueNumber))
  window.history.pushState({}, '', url.toString())
  await loadSession(session)
}

async function loadSession(session: ChatSession) {
  sessionStore.setActiveSession(session)
  await sessionStore.loadMessages(authStore.token!, repo.value, session.issueNumber)
  inputText.value = ''
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
  building.value = false
  clarifying.value = false
  clarifyingMsg.value = ''
  pendingBuildContext.value = ''
  triageLog.value = []
}
</script>

<template>
  <div class="workspace">
    <aside class="sidebar">
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
      <div class="sessions-list" v-if="sessionStore.sortedSessions.length">
        <h3>最近对话</h3>

        <!-- 平台会话（mitosis 自举） -->
        <template v-if="sessionStore.groupedSessions.platform.length">
          <div class="session-group-label">🧬 平台</div>
          <div
            v-for="session in sessionStore.groupedSessions.platform"
            :key="session.issueNumber"
            class="session-item"
            :class="{ active: sessionStore.activeSession?.issueNumber === session.issueNumber, closed: session.status === 'closed' }"
            @click="navigateToSession(session)"
          >
            <span class="session-title">{{ session.title }}</span>
            <span class="session-status" :class="session.status">{{ session.status === 'open' ? '●' : '○' }}</span>
          </div>
        </template>

        <!-- 应用会话：也是「我的应用」入口，点击会话查看历史，点击「打开」跳转路由 -->
        <template v-if="sessionStore.groupedSessions.app.length">
          <div class="session-group-label">📦 应用</div>
          <div
            v-for="session in sessionStore.groupedSessions.app"
            :key="session.issueNumber"
            class="session-item"
            :class="{ active: sessionStore.activeSession?.issueNumber === session.issueNumber, closed: session.status === 'closed' }"
            @click="navigateToSession(session)"
          >
            <span class="session-title">{{ session.title }}</span>
            <span class="session-status" :class="session.status">{{ session.status === 'open' ? '●' : '○' }}</span>
            <button class="session-open-btn" @click.stop="openAppSession(session)" title="打开应用">打开</button>
          </div>
        </template>

        <!-- 其他会话 -->
        <template v-if="sessionStore.groupedSessions.other.length">
          <div class="session-group-label">其他</div>
          <div
            v-for="session in sessionStore.groupedSessions.other"
            :key="session.issueNumber"
            class="session-item"
            :class="{ active: sessionStore.activeSession?.issueNumber === session.issueNumber, closed: session.status === 'closed' }"
            @click="navigateToSession(session)"
          >
            <span class="session-title">{{ session.title }}</span>
            <span class="session-status" :class="session.status">{{ session.status === 'open' ? '●' : '○' }}</span>
          </div>
        </template>
      </div>
    </aside>
    <main class="chat-area">
      <div class="messages">
        <!-- 有活跃会话且没有消息时显示会话标题 -->
        <div v-if="displayMessages.length === 0 && sessionStore.activeSession" class="welcome session-welcome">
          <h3>{{ sessionStore.activeSession.title }}</h3>
          <p>Issue #{{ sessionStore.activeSession.issueNumber }} · {{ sessionStore.activeSession.messageCount }} 条消息</p>
          <p class="hint-text">发送消息开始对话</p>
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

.session-status {
  font-size: 0.7rem;
  flex-shrink: 0;
}

.session-status.open {
  color: #2ea043;
}

.session-status.closed {
  color: #8b949e;
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

.session-item.active {
  background: var(--bg-tertiary);
  color: var(--accent);
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

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
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
  opacity: 0.6;
  text-align: right;
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

.read-only-banner {
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
}
</style>
