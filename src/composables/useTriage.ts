/**
 * useTriage — Workspace 聊天消息智能分拣
 *
 * 三级策略：
 * 1. 正则关键词快速通道（零延迟、零成本，覆盖高频明确表达）
 * 2. 正则未命中时用 StepFun LLM 做语义分拣（解决"每次都被要求选择任务类型"）
 * 3. LLM 不可用/失败时只对疑似任务请求澄清；闲聊保持本地临时聊天
 */
import { buildStepFunUserContent, chatWithStepFun, type StepFunImageInput } from './useStepFun'

export type TriageAction = 'chat' | 'build' | 'platform' | 'clarify'

export interface TriageResult {
  action: TriageAction
  scenario: 'platform' | 'app_create' | 'app_iterate'
  intent: 'question' | 'create_app' | 'modify_platform' | 'unknown'
  complexity: 'simple' | 'medium' | 'complex'
  scope: 'none' | 'apps-only' | 'platform'
  basedOn?: string
  /** Optional privacy-conscious visual summary returned by multimodal triage. */
  visualSummary?: string
  /** 分拣来源：keyword 正则命中 | llm 语义分拣 | fallback 降级 */
  source?: 'keyword' | 'llm' | 'fallback'
}

// ─── 1. 正则快速通道 ─────────────────────────────────────

export function triageByKeywords(text: string): TriageResult {
  const lower = text.toLowerCase()

  // 平台关键词 — Mitosis 自身变更（涉及代码架构、CI/CD、认证、部署、核心组件）
  // 模式 1: 组件名 + 功能/逻辑动词 → 明确平台变更
  const isPlatform =
    /src\//i.test(text) ||
    /mitosis\s*(?:平台)?\s*(支持|增加|去掉|删除|修改|升级|重构|架构|核心逻辑|优化|改进|调整|修复)/i.test(text) ||
    /mitosis\s*平台/i.test(text) ||
    /(?:优化|改进|调整|修复|修改).{0,20}mitosis/i.test(text) ||
    /mitosis.{0,20}(?:输入框|移动端|样式|页面|体验|交互|功能|逻辑)/i.test(text) ||
    /(?:给|帮|让)\s*mitosis\s*(加|增加|加个|去掉|删|改|升级|支持|架构|重构|优化|改进|调整|修复)/i.test(text) ||
    /(?:Workspace|Gallery|SetupPage|ChatInput|侧边栏)\s*(?:的)?\s*(?:体验|交互|性能|逻辑|功能|架构|导航|路由|上传|表单|消息|通知|样式|外观|布局)/i.test(text) ||
    /(?:GitHub Actions|workflow|CI|OAuth|认证|deploy|gh-pages|composable|组件库|SSE|流式|token|权限)/i.test(text)

  // 询问关键词
  const isQuestion =
    /^(?:怎么|如何|为什么|是什么|能不能|可以|能否|是否|有没有|请问|帮忙|help|how|what|why)/.test(lower) ||
    /[?？]$/.test(text.trim()) ||
    /(?:进度|状态|帮助|介绍|解释|说明|区别|是什么|什么模型|用的什么|你.*什么|哪[个种款]?|多少|几[个次]?)/.test(text)

  // 否定语义优先于任务关键词：例如“不要创建应用，只说明原理”仍是询问。
  const isNegatedTask = /(?:不要|无需|不需要|不想|请勿).{0,12}(?:创建|做|开发|修改|生成).{0,12}(?:应用|任务|平台)/i.test(text)

  // 创建应用关键词（扩展：直接点名游戏/应用名也视为创建意图）
  const isAppBuild = !isNegatedTask &&
    /(?:做一个|创建.*应用|建.*应用|写一个|写个|写.*应用|开发.*应用|实现.*应用|做个|搞个|弄个|做个游戏|做个工具|想做个|想做一个|新应用|记账本|记账工具)/.test(text) ||
    /(?:build|create.*app|make.*app|new app)/i.test(lower) ||
    /^(?:俄罗斯方块|贪吃蛇|snake|tetris|todo|计算器|calculator|俄罗斯|打砖块|breakout|flappy|2048).*$/i.test(text.trim())

  // 简单微调 + 优化/改进关键词（R2：直接回复，不创建 Issue）
  const isSimpleTweak =
    /(?:改|优化|改进|调整|调).{0,8}(?:颜色|字体|大小|样式|图标|按钮|背景|间距|圆角|阴影|体验|布局|交互|触控|移动端|动画|性能|速度|响应)/.test(text) ||
    /(?:改|优化|改进).{0,8}(?:俄罗斯方块|贪吃蛇|snake|tetris|todo|计算器|calculator|打砖块|breakout|flappy|2048|画板|棋盘)/.test(text) ||
    /(?:字体|颜色|间距|圆角|阴影)/.test(text)

  // "继续迭代"关键词
  const isContinue = /(?:继续|上次|迭代|在.*基础上|基于.*继续)/.test(text)

  const isTaskLike =
    isPlatform ||
    isAppBuild ||
    isSimpleTweak ||
    isContinue ||
    /(?:帮我|给它|给这个|把它|加个|加一个|改一下|改下|修一下|修复|优化|调整|实现|开发|创建|生成|收拾一下|弄一下|应用|游戏|工具|页面|功能|平台|需求|issue|任务|输入框|侧边栏|侧栏|左边|右边|那一栏)/i.test(text)

  // 提取"基于哪个应用"
  let basedOn: string | undefined
  const m = text.match(/(?:在|基于)\s*([a-z0-9-]+)\s*(?:的?基础上|之上)/i)
  if (m) basedOn = m[1].toLowerCase()
  const explicitIteration = text.match(/(?:迭代|优化|修改|更新|继续开发|继续完善)\s*(?:应用\s*)?([a-z][a-z0-9-]{1,46})/i)
  if (!basedOn && explicitIteration) basedOn = explicitIteration[1].toLowerCase()
  if (!basedOn) {
    const knownApp = lower.match(/\b(tetris-game|snake-game|todo-app|calculator|breakout|flappy-bird|paint|chat-app|doodle|pixel-art|2048|pong)\b/)?.[1]
    if (knownApp) basedOn = knownApp
    else if (/俄罗斯方块/.test(text)) basedOn = 'tetris-game'
    else if (/贪吃蛇/.test(text)) basedOn = 'snake-game'
    else if (/(?:todo|待办)/i.test(text)) basedOn = 'todo-app'
  }

  // R4/R5: 明确的平台修改优先于消息中附带的“状态/怎么”等问句词。
  if (isPlatform) {
    return { action: 'platform', scenario: 'platform', intent: 'modify_platform', complexity: 'medium', scope: 'platform', source: 'keyword' }
  }
  // R1: 纯询问（"介绍一下这个平台"是提问，不创建任务）。
  if (isQuestion && !isAppBuild && !isContinue) {
    return { action: 'chat', scenario: 'app_create', intent: 'question', complexity: 'simple', scope: 'none', source: 'keyword' }
  }
  // R3: 应用构建（新建 or 复杂修改 or 继续迭代）
  // 注意：isAppBuild 必须在 isQuestion 之前检查，避免 "做一个游戏" 被误判为问题
  if (isAppBuild || isContinue || (isSimpleTweak && basedOn)) {
    const scenario = basedOn ? 'app_iterate' : 'app_create'
    return {
      action: 'build',
      scenario,
      intent: 'create_app',
      complexity: isContinue || basedOn ? 'medium' : 'complex',
      scope: 'apps-only',
      basedOn,
      source: 'keyword',
    }
  }
  // R2: 已有应用的简单微调
  if (isSimpleTweak && !isContinue) {
    return { action: 'chat', scenario: 'app_iterate', intent: 'create_app', complexity: 'simple', scope: 'apps-only', basedOn, source: 'keyword' }
  }
  // 非任务闲聊/探测输入不追问，也不升级为 Issue。
  if (!isTaskLike) {
    return { action: 'chat', scenario: 'app_create', intent: 'question', complexity: 'simple', scope: 'none', source: 'keyword' }
  }

  // R6: 疑似任务但目标不清 → 交给上层（LLM 或澄清）
  return { action: 'clarify', scenario: 'app_create', intent: 'unknown', complexity: 'simple', scope: 'none', source: 'keyword' }
}

// ─── 2. LLM 语义分拣 ─────────────────────────────────────

const LLM_TRIAGE_TIMEOUT = 8000

const TRIAGE_SYSTEM_PROMPT = `你是 Mitosis 平台的意图分拣器。只输出一行 JSON，禁止输出任何其他文字。

核心原则：宁可做错，不要反复追问。用户已经表达了意图，尽量做出判断。

分类标准：
- "build"：想创建或迭代一个应用/游戏/工具（部署在 apps/ 下的独立小应用）
  - 包含"创建/做一个/开发/写个/弄个/生成" + "应用/游戏/工具" → build
  - 包含"在 X 基础上/基于 X 继续/在 X 上加" → build（basedOn 填 X）
  - 提到具体应用名（俄罗斯方块/贪吃蛇/todo/计算器/打砖块等）→ build
- "platform"：想修改 Mitosis 平台自身（界面、聊天、认证、CI、部署等）
  - 提到组件名（Workspace/Gallery/ChatInput/侧边栏）或平台功能 → platform
- "chat"：打招呼、提问、咨询、闲聊，不需要写代码
  - 以怎么/如何/为什么/是什么/能不能开头 → chat
  - 纯表情、纯感叹词 → chat
- "clarify"：真的完全无法判断（如单个词"优化"没有上下文）时才用

重要规则：
- 只要消息包含"创建/做/开发/写/弄/加/改/优化" + 目标对象，优先判断为 build 或 platform
- 不要因为"不确定是创建新应用还是修改已有应用"就返回 clarify，直接返回 build
- 用户说"在 xxx 基础上"一定是 build（迭代已有应用）
- 如果包含图片，结合图片判断意图；summary 用一句话概括可见的产品/界面问题，必须省略 token、账号、邮箱、手机号、URL 参数和其他个人信息

输出格式：{"action":"chat|build|platform|clarify","basedOn":null,"summary":""}`

/** 从 LLM 输出中提取并校验分拣 JSON；格式非法时抛错由上层降级 */
function parseLLMTriage(raw: string): { action: TriageAction; basedOn?: string; visualSummary?: string } {
  const jsonMatch = raw.match(/\{[^{}]*\}/)
  if (!jsonMatch) throw new Error('LLM triage: no JSON found')
  const parsed = JSON.parse(jsonMatch[0]) as { action?: string; basedOn?: string | null; summary?: string | null }
  const validActions: TriageAction[] = ['chat', 'build', 'platform', 'clarify']
  if (!parsed.action || !validActions.includes(parsed.action as TriageAction)) {
    throw new Error(`LLM triage: invalid action "${parsed.action}"`)
  }
  const basedOn = typeof parsed.basedOn === 'string' && /^[a-z0-9-]+$/i.test(parsed.basedOn)
    ? parsed.basedOn.toLowerCase()
    : undefined
  const visualSummary = typeof parsed.summary === 'string' && parsed.summary.trim()
    ? parsed.summary.trim().slice(0, 600)
    : undefined
  return { action: parsed.action as TriageAction, basedOn, visualSummary }
}

/** 将 LLM 的 action 映射为完整 TriageResult */
function llmActionToResult(action: TriageAction, basedOn?: string, visualSummary?: string): TriageResult {
  switch (action) {
    case 'build':
      return {
        action: 'build',
        scenario: basedOn ? 'app_iterate' : 'app_create',
        intent: 'create_app',
        complexity: basedOn ? 'medium' : 'complex',
        scope: 'apps-only',
        basedOn,
        source: 'llm',
        visualSummary,
      }
    case 'platform':
      return { action: 'platform', scenario: 'platform', intent: 'modify_platform', complexity: 'medium', scope: 'platform', source: 'llm', visualSummary }
    case 'chat':
      return { action: 'chat', scenario: 'app_create', intent: 'question', complexity: 'simple', scope: 'none', source: 'llm' }
    default:
      return { action: 'clarify', scenario: 'app_create', intent: 'unknown', complexity: 'simple', scope: 'none', source: 'llm' }
  }
}

export async function triageWithLLM(stepToken: string, text: string, images: StepFunImageInput[] = []): Promise<TriageResult> {
  const raw = await chatWithStepFun(
    stepToken,
    [{ role: 'user', content: buildStepFunUserContent(text || '请结合图片判断用户意图。', images) }],
    { system: TRIAGE_SYSTEM_PROMPT, timeout: LLM_TRIAGE_TIMEOUT },
  )
  const { action, basedOn, visualSummary } = parseLLMTriage(raw)
  return llmActionToResult(action, basedOn, visualSummary)
}

// ─── 3. 组合入口 ─────────────────────────────────────────

export interface SmartTriageOptions {
  /** StepFun token；缺省时跳过 LLM 分拣 */
  stepToken?: string
  /** 上一轮澄清前的原始消息；存在时表示本消息是澄清回答，禁止再次澄清 */
  clarifyContext?: string
  /** Ephemeral attachments; sent only to the Step Plan multimodal classifier. */
  images?: StepFunImageInput[]
}

/** 澄清后仍无法判断时保持聊天，不得自动升级为 Issue。 */
function fallbackChat(): TriageResult {
  return { action: 'chat', scenario: 'app_create', intent: 'question', complexity: 'simple', scope: 'none', source: 'fallback' }
}

export async function smartTriage(text: string, opts: SmartTriageOptions = {}): Promise<TriageResult> {
  const effectiveText = opts.clarifyContext ? `${opts.clarifyContext}\n${text}` : text

  // 1. 正则快速通道：命中即返回，零延迟
  const keywordResult = triageByKeywords(effectiveText)
  const imageMayChangeDecision = Boolean(opts.images?.length)
  if (keywordResult.action !== 'clarify' && !imageMayChangeDecision) {
    return keywordResult
  }

  // 2. LLM 语义分拣
  if (opts.stepToken) {
    try {
      const llmResult = await triageWithLLM(opts.stepToken, effectiveText, opts.images)
      if (llmResult.action !== 'clarify') {
        return llmResult
      }
    } catch {
      console.warn('[TRIAGE] LLM 分拣失败，已安全降级')
    }
  }

  // 澄清最多一次。无法确认目标时不能猜测为创建应用；否则一句模糊话
  // 就会意外创建 Issue。澄清后仍不明确时保持临时聊天。
  if (opts.clarifyContext) {
    return fallbackChat()
  }
  return { action: 'clarify', scenario: 'app_create', intent: 'unknown', complexity: 'simple', scope: 'none', source: 'fallback' }
}
