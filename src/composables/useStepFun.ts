import { fetchWithTimeout } from './useGitHubAPI'

const DEFAULT_MODEL = 'step-3.7-flash'
const DEFAULT_TIMEOUT = 15000
const MAX_RETRIES = 1
const RETRY_BASE_DELAY = 1000
export const STEP_PLAN_CHAT_COMPLETIONS_URL = 'https://api.stepfun.com/step_plan/v1/chat/completions'

export interface StepFunMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StepFunOptions {
  /** 系统提示词，通过 API 原生 system 字段传入（不混入 messages 数组） */
  system?: string
  /** 模型名称，默认 step-3.7-flash */
  model?: string
  /** 请求超时（ms），默认 15000 */
  timeout?: number
}

export interface StepFunResponse {
  choices: {
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface FormattedError {
  /** 用户可读的中文标题 */
  title: string
  /** 详细说明 */
  detail: string
  /** 错误类型：quota | auth | network | server | unknown */
  kind: 'quota' | 'auth' | 'network' | 'server' | 'unknown'
  /** 可操作建议 */
  suggestion: string
}

/** 判断错误是否可重试（网络错误或 5xx） */
function isRetryable(err: Error): boolean {
  const msg = err.message.toLowerCase()
  // 网络错误（AbortError / TypeError: fetch failed）
  if (err.name === 'AbortError' || (err.name === 'TypeError' && /failed to fetch|network/.test(msg))) {
    return true
  }
  // 5xx 服务端错误
  if (/StepFun API error: 5[0-9]{2}/i.test(err.message)) {
    return true
  }
  return false
}

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 将 StepFun API 错误格式化为可读中文 + 可操作建议
 */
export function formatStepFunError(err: unknown): FormattedError {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    const raw = err.message

    // 配额类错误
    if (
      err.name === 'AbortError' ||
      /timeout/.test(msg) ||
      /exceeded your current quota/.test(raw) ||
      /insufficient_quota/.test(msg) ||
      /429/.test(raw)
    ) {
      return {
        title: '⏱️ 请求超时或额度已用尽',
        detail: 'StepFun API 响应超时（15s）或当前额度/配额已耗尽。',
        kind: 'quota',
        suggestion: '请稍后重试，或检查 StepFun 账户余额后更新 token。你也可以直接创建 Issue 让我帮你构建。',
      }
    }

    // 鉴权错误
    if (
      /401/.test(raw) ||
      /invalid[_\s]api[_\s]key/.test(msg) ||
      /incorrect[_\s]api[_\s]key/.test(msg) ||
      /unauthorized/.test(msg) ||
      /authentication/.test(msg) ||
      /token.*required|missing.*token/.test(msg) ||
      /auth.*fail|token.*invalid|token.*expired/.test(msg)
    ) {
      return {
        title: '🔑 Token 无效或已过期',
        detail: 'StepFun API 返回鉴权失败，token 可能已过期或被撤销。',
        kind: 'auth',
        suggestion: '请点击下方的「更新 Token」按钮前往 Setup 页面重新输入。',
      }
    }

    // 网络错误
    if (
      err.name === 'TypeError' &&
      /failed to fetch|networkerror|network/.test(msg)
    ) {
      return {
        title: '🌐 网络连接失败',
        detail: '无法连接到 StepFun API，可能是网络中断或 DNS 解析失败。',
        kind: 'network',
        suggestion: '请检查网络连接后重试。你也可以直接创建 Issue 让我帮你构建。',
      }
    }

    // 5xx 服务端错误
    if (/50[0-9]/.test(raw)) {
      return {
        title: 'StepFun 服务异常',
        detail: `StepFun 服务器返回错误 (${raw.match(/50[0-9]/)?.[0] || '5xx'})。`,
        kind: 'server',
        suggestion: 'StepFun 服务暂时不可用，请稍后重试。你也可以直接创建 Issue。',
      }
    }
  }

  return {
    title: '❌ 请求失败',
    detail: err instanceof Error ? err.message : '未知错误',
    kind: 'unknown',
    suggestion: '请重试，或直接创建 Issue 让我帮你构建。',
  }
}

async function callStepFun(
  token: string,
  messages: StepFunMessage[],
  options: StepFunOptions,
): Promise<string> {
  const model = options.model || DEFAULT_MODEL
  const timeout = options.timeout || DEFAULT_TIMEOUT

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 4096,
  }
  if (options.system) {
    body.system = options.system
  }

  const res = await fetchWithTimeout(
    STEP_PLAN_CHAT_COMPLETIONS_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    timeout,
  )

  if (!res.ok) {
    const errText = await res.text()
    let errMsg = `StepFun API error: ${res.status}`
    try {
      const errJson = JSON.parse(errText)
      if (errJson.error?.message) {
        // 保留状态码前缀，确保 formatStepFunError 能通过 /401/ 等模式识别鉴权错误
        errMsg = `${res.status} — ${errJson.error.message}`
      } else {
        errMsg = `${errMsg} — ${errText.slice(0, 200)}`
      }
    } catch {
      errMsg = `${errMsg} — ${errText.slice(0, 200)}`
    }
    throw new Error(errMsg)
  }

  const data: StepFunResponse = await res.json()
  return data.choices?.[0]?.message?.content || '(empty response)'
}

export const STEP_PLAN_IMAGE_GENERATION_URL = 'https://api.stepfun.com/step_plan/v1/images/generations'

export interface GenerateImageOptions {
  prompt: string
  /** 模型名称，默认 step-image-edit-2 */
  model?: string
  /** 输出格式：b64_json（默认）或 url */
  response_format?: 'b64_json' | 'url'
  /** 分类器自由引导比例，默认 1.0 */
  cfg_scale?: number
  /** 扩散步数，默认 8 */
  steps?: number
  /** 随机种子，默认随机 */
  seed?: number
  /** 是否启用文字渲染模式，默认 false */
  text_mode?: boolean
}

export interface GeneratedImage {
  /** base64 编码的图片数据（不含 data:image/...;base64, 前缀） */
  b64_json?: string
  /** 图片 URL（当 response_format=url 时返回） */
  url?: string
  /** 原始 MIME 类型 */
  contentType?: string
}

/**
 * 调用 Step Plan Image API 生成图片
 * 需要有效的 Step Plan token（与 chat completions 使用相同的认证）
 */
export async function generateImage(
  token: string,
  options: GenerateImageOptions,
): Promise<GeneratedImage> {
  const {
    prompt,
    model = 'step-image-edit-2',
    response_format = 'b64_json',
    cfg_scale = 1.0,
    steps = 8,
    seed = Math.floor(Math.random() * 2147483647),
    text_mode = false,
  } = options

  const body: Record<string, unknown> = {
    model,
    prompt,
    response_format,
    cfg_scale,
    steps,
    seed,
    text_mode,
  }

  const res = await fetchWithTimeout(
    STEP_PLAN_IMAGE_GENERATION_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    30000,
  )

  if (!res.ok) {
    const errText = await res.text()
    let errMsg = `Image API error: ${res.status}`
    try {
      const errJson = JSON.parse(errText)
      if (errJson.error?.message) {
        errMsg = `${res.status} — ${errJson.error.message}`
      }
    } catch {
      errMsg = `${errMsg} — ${errText.slice(0, 200)}`
    }
    throw new Error(errMsg)
  }

  const data = await res.json()
  const imageData = data.data?.[0]

  if (!imageData) {
    throw new Error('Image API 返回空数据')
  }

  return {
    b64_json: imageData.b64_json,
    url: imageData.url,
    contentType: imageData.content_type || 'image/png',
  }
}

/**
 * 为应用生成 logo 的 prompt 构建器
 * 根据应用类型和描述生成适合 Step Plan Image API 的 prompt
 */
export function buildLogoPrompt(appName: string, description: string): string {
  const appTypeHint = description.length > 0 ? description.slice(0, 50) : '通用应用'
  return `一个简洁的现代应用图标/logo，应用名称"${appName}"，风格：${appTypeHint}。要求：纯色背景，中心有一个简洁的几何图标，无文字，扁平化设计，高对比度，适合用作 favicon 和 app icon。颜色方案：蓝色系或根据应用主题色。`
}

export async function chatWithStepFun(
  token: string,
  messages: StepFunMessage[],
  options: StepFunOptions = {},
): Promise<string> {
  if (!token.trim()) {
    throw new Error('StepFun token required')
  }

  let lastErr: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callStepFun(token, messages, options)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error('未知错误')
      // 不重试的错误直接抛出
      if (!isRetryable(lastErr) || attempt >= MAX_RETRIES) {
        throw lastErr
      }
      // 指数退避等待后重试
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt)
      await sleep(delay)
    }
  }

  throw lastErr ?? new Error('StepFun API 调用失败')
}
