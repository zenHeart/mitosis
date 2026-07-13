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

      // mask before create: apply privacy masking to issue title and body
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

/**
 * 获取单个 app 的最新版本号（从 GitHub contents/apps/{appName} 目录读取）
 * 不依赖 issue 标题中的版本信息，避免 CI 不更新标题导致版本错误
 */
export async function getLatestAppVersion(
  token: string,
  repo: string,
  appName: string,
  options: { required?: boolean } = {},
): Promise<number> {
  // GitHub apps 目录只包含 ASCII slug（如 tetris-game），非 ASCII 或含空格的名称直接跳过
  if (!/^[a-z0-9-]+$/.test(appName)) {
    if (options.required) throw new Error('App version lookup failed')
    return 0
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetchWithTimeout(ghUrl(repo, `/contents/apps/${appName}`), { headers })
    if (!res.ok) {
      if (options.required) throw new Error('App version lookup failed')
      return 0
    }
    const items = await res.json()
    if (!Array.isArray(items)) {
      if (options.required) throw new Error('App version lookup failed')
      return 0
    }
    const versionDirs = items.filter((v: { type: string; name?: string }) => v.type === 'dir' && v.name?.startsWith('v'))
    const versions = versionDirs
      .map((v: { name?: string }) => Number((v.name || '').replace(/^v/, '')))
      .filter((v: number) => Number.isInteger(v) && v >= 0)
    if (versions.length === 0) {
      if (options.required) throw new Error('App version lookup failed')
      return 0
    }
    return versions.sort((a, b) => b - a)[0]
  } catch {
    if (options.required) throw new Error('App version lookup failed')
    return 0
  }
}

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
      }) => {
        const labelNames = issue.labels.map((l: { name: string }) => l.name)
        // scenario 从标签推断
        let scenario: 'platform' | 'app_create' | 'app_iterate' | undefined
        if (labelNames.includes('platform')) {
          scenario = 'platform'
        } else if (labelNames.includes('update')) {
          scenario = 'app_iterate'
        } else if (labelNames.some((l: string) => l.startsWith('app/'))) {
          scenario = 'app_create'
        }
        return {
          issueNumber: issue.number,
          title: issue.title,
          status: issue.state as 'open' | 'closed',
          labels: labelNames,
          messageCount: 0,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          appLabel: issue.labels.find((l: { name: string }) => l.name.startsWith('app/'))?.name,
          scenario,
        }
      })
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

      // mask before comment: apply privacy masking to comment body
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

/** 更新 Issue 状态和/或标签 */
export async function updateIssue(
  token: string,
  repo: string,
  issueNumber: number,
  state?: 'open' | 'closed',
  labels?: string[]
): Promise<BuildIssue> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const body: Record<string, unknown> = {}
  if (state) body.state = state
  if (labels) body.labels = labels

  const res = await fetchWithTimeout(ghUrl(repo, `/issues/${issueNumber}`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to update issue: ${res.status} — ${err}`)
  }
  return res.json()
}
