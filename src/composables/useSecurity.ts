/**
 * 隐私脱敏工具
 *
 * 安全原则（来自 .claude/rules/security.md）：
 * - GitHub Issues 是公开的，不能存储明文密码/token/secret
 * - 存储前必须脱敏
 * - 日志中不能打印原始敏感值
 */

// mask sensitive data before store (C14-C15)
// 敏感字段关键词
const SENSITIVE_KEYS = [
  'password', 'passwd', 'pwd',
  'secret', 'token', 'api_key',
  'api_secret', 'private_key',
  'access_key', 'client_secret',
] as const

// 脱敏替换值
export const MASKED = '***'

/**
 * 检测文本中是否包含敏感字段，并替换值为 ***
 * 正则: (password|passwd|pwd|secret|token|api_key)\s*[:=]\s*.+
 */
export function maskSensitive(text: string): string {
  if (!text) return text

  const pattern = new RegExp(
    `(${SENSITIVE_KEYS.join('|')})\\s*[:=]\\s*.+`,
    'gi'
  )

  return text.replace(pattern, (_match, key) => {
    return `${key}: ${MASKED}`
  })
}

/**
 * 检查文本是否包含敏感字段
 */
export function containsSensitive(text: string): boolean {
  if (!text) return false
  const pattern = new RegExp(
    `(${SENSITIVE_KEYS.join('|')})\\s*[:=]`,
    'gi'
  )
  return pattern.test(text)
}

/**
 * 安全日志 — 自动脱敏敏感字段
 */
export function safeLog(message: string, ...args: unknown[]): void {
  const masked = maskSensitive(message)
  const maskedArgs = args.map(a => typeof a === 'string' ? maskSensitive(a) : a)
  console.log(masked, ...maskedArgs)
}

/**
 * 安全错误 — 不包含原始敏感值的错误消息
 */
export function safeError(context: string, originalError: unknown): Error {
  const maskedContext = maskSensitive(context)
  const message = originalError instanceof Error ? originalError.message : String(originalError)
  const maskedMessage = maskSensitive(message)
  return new Error(`${maskedContext}: ${maskedMessage}`)
}
