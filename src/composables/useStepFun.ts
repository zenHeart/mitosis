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
        suggestion: '请更新你的 StepFun token 后重试。前往 Setup 页面重新输入。',
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
