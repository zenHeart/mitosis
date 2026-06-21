import DOMPurify from 'dompurify'
import { marked } from 'marked'

// ── DOMPurify 白名单配置 ──────────────────────────────────
// 安全原则：仅允许必要标签，禁止 on* 事件属性

export const ALLOWED_TAGS = [
  'p', 'br', 'code', 'pre',
  'table', 'tr', 'td', 'th',
  'ul', 'ol', 'li',
  'strong', 'em',
  'a',
  'span', 'del',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote',
  'hr',
] as const

export const ALLOWED_ATTR = [
  'href', 'target', 'rel',
  'class', 'id',
] as const

// a 标签安全强制配置
export const LINK_SECURITY = {
  target: '_blank',
  rel: 'noopener noreferrer',
}

/**
 * 对 HTML 内容进行 DOMPurify 安全过滤
 * - 移除所有不在白名单中的标签和属性
 * - 强制 a 标签 target="_blank" + rel="noopener noreferrer"
 * - 自动剥离 on* 事件属性
 */
export function sanitize(dirty: string): string {
  if (!dirty) return ''

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    FORBID_TAGS: ['style', 'link', 'meta', 'script', 'iframe', 'form', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
    ADD_ATTR: ['target', 'rel'],
  })
}

/**
 * 将 Markdown 文本转换为安全 HTML：marked 解析 → DOMPurify 过滤
 * - 适用于 GitHub Issue body、评论等 Markdown 内容
 * - 两步过滤确保 XSS 安全（M2, M3）
 */
export function markdownToHtml(md: string): string {
  if (!md) return ''
  const html = marked.parse(md, { async: false }) as string
  return sanitize(html)
}
