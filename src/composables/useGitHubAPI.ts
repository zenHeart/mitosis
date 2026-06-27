import type { BuildIssue, AppInfo, IssueComment, ChatSession } from '../types/app'
import { maskSensitive } from './useSecurity'
import {
  isMockMode,
  mockCreateIssue,
  mockGetIssue,
  mockListUserIssues,
  mockGetIssueComments,
  mockCreateIssueComment,
} from './useMockGitHub'

// ── Mock 路由辅助 ──────────────────────────────────────

async function withMock<T>(
  realFn: () => Promise<T>,
  mockFn: () => Promise<T>
): Promise<T> {
  return isMockMode() ? mockFn() : realFn()
}

// ── API 基础 URL ──────────────────────────────────────────────
// 开发模式：走 Vite dev server proxy（/api/github/ → api.github.com）
//   自动走 macOS 系统代理，解决本地网络不通问题
// 生产模式：直接访问 api.github.com（公开仓库无需认证）
const IS_DEV = import.meta.env.DEV
const GITHUB_API_BASE = IS_DEV ? '/api/github' : 'https://api.github.com'

function ghUrl(repo: string, path: string): string {
  return `${GITHUB_API_BASE}/repos/${repo}${path}`
}

export async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeout = 15000
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function createIssue(
  token: string,
  repo: string,
  title: string,
  body: string,
  labels: string[]
): Promise<BuildIssue> {
  return withMock(
    async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      // mask sensitive data before creating issue (C14-C15)
      const maskedIssueTitle = maskSensitive(title)
      const maskedIssueBody = maskSensitive(body)

      const res = await fetchWithTimeout(ghUrl(repo, '/issues'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: maskedIssueTitle, body: maskedIssueBody, labels }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to create issue: ${res.status} — ${err}`)
      }
      return res.json()
    },
    async () => mockCreateIssue(token, repo, title, body, labels)
  )
}

export async function getIssue(
  token: string,
  repo: string,
  issueNumber: number
): Promise<BuildIssue> {
  return withMock(
    async () => {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetchWithTimeout(ghUrl(repo, `/issues/${issueNumber}`), { headers })
      if (!res.ok) throw new Error(`Failed to get issue: ${res.status}`)
      return res.json()
    },
    async () => mockGetIssue(token, repo, issueNumber)
  )
}

export async function listApps(token: string, repo: string): Promise<AppInfo[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetchWithTimeout(ghUrl(repo, '/contents/apps'), { headers })
    if (!res.ok) return []
    const items = await res.json()
    if (!Array.isArray(items)) return []

    const apps: AppInfo[] = []
    for (const item of items) {
      if (item.type === 'dir') {
        try {
          const versionsRes = await fetchWithTimeout(ghUrl(repo, `/contents/apps/${item.name}`), {
            headers,
          })
          if (!versionsRes.ok) continue
          const versions = await versionsRes.json()
          const versionDirs = Array.isArray(versions)
            ? versions.filter((v: { type: string }) => v.type === 'dir')
            : []
          const latestVersion = versionDirs
            .map((v: { name?: string }) => Number((v.name || '').replace(/^v/, '')))
            .filter((v: number) => Number.isInteger(v) && v >= 0)
            .sort((a: number, b: number) => b - a)[0] ?? 0
          apps.push({
            id: item.name,
            name: item.name,
            latestVersion,
            url: `/apps/${item.name}/v${latestVersion}/`,
            createdAt: item.created_at || '',
          })
        } catch {
          continue
        }
      }
    }
    return apps
  } catch {
    return []
  }
}

// ── 会话管理 API ──────────────────────────────────────────

/** 列出用户的 chat session（过滤 label=session/chat，只返回 open） */
export async function listUserIssues(
  token: string,
  repo: string
): Promise<ChatSession[]> {
  return withMock(
    async () => {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetchWithTimeout(
        ghUrl(repo, '/issues?state=all&per_page=50&sort=updated&direction=desc'),
        { headers }
      )
      if (!res.ok) return []
      const issues = await res.json()
      if (!Array.isArray(issues)) return []

      return issues.map((issue: {
        number: number
        title: string
        state: string
        labels: { name: string }[]
        created_at: string
        updated_at: string
      }) => ({
        issueNumber: issue.number,
        title: issue.title,
        status: issue.state as 'open' | 'closed',
        labels: issue.labels.map((l: { name: string }) => l.name),
        messageCount: 0,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        appLabel: issue.labels.find((l: { name: string }) => l.name.startsWith('app/'))?.name,
      }))
    },
    async () => mockListUserIssues(token, repo)
  )
}

/** 获取 Issue 的所有评论（按时间排序） */
export async function getIssueComments(
  token: string,
  repo: string,
  issueNumber: number
): Promise<IssueComment[]> {
  return withMock(
    async () => {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetchWithTimeout(
        ghUrl(repo, `/issues/${issueNumber}/comments?per_page=100&sort=created&direction=asc`),
        { headers }
      )
      if (!res.ok) return []
      const comments = await res.json()
      if (!Array.isArray(comments)) return []

      return comments.map((c: {
        id: number
        body: string
        user: { login: string; avatar_url?: string }
        created_at: string
      }) => ({
        id: c.id,
        body: c.body,
        user: { login: c.user.login, avatar_url: c.user.avatar_url },
        created_at: c.created_at,
      }))
    },
    async () => mockGetIssueComments(token, repo, issueNumber)
  )
}

/** 创建 Issue 评论 */
export async function createIssueComment(
  token: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<IssueComment> {
  return withMock(
    async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      // sanitize and mask sensitive data before create comment (C14-C15)
      const maskedCommentBody = maskSensitive(body)

      const res = await fetchWithTimeout(
        ghUrl(repo, `/issues/${issueNumber}/comments`),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ body: maskedCommentBody }),
        }
      )
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to create comment: ${res.status} — ${err}`)
      }
      return res.json()
    },
    async () => mockCreateIssueComment(token, repo, issueNumber, body)
  )
}
