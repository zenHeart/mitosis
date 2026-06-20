import type { BuildIssue, AppInfo } from '../types/app'

// ── API 基础 URL ──────────────────────────────────────────────
// 开发模式：走 Vite dev server proxy（/api/github/ → api.github.com）
//   自动走 macOS 系统代理，解决本地网络不通问题
// 生产模式：直接访问 api.github.com（公开仓库无需认证）
const IS_DEV = import.meta.env.DEV
const GITHUB_API_BASE = IS_DEV ? '/api/github' : 'https://api.github.com'

function ghUrl(repo: string, path: string): string {
  return `${GITHUB_API_BASE}/repos/${repo}${path}`
}

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeout = 10000
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
  }
  // 开发模式 token 由 Vite proxy 自动添加，但传了也安全
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(ghUrl(repo, '/issues'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, body, labels }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create issue: ${res.status} — ${err}`)
  }
  return res.json()
}

export async function getIssue(
  token: string,
  repo: string,
  issueNumber: number
): Promise<BuildIssue> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(ghUrl(repo, `/issues/${issueNumber}`), { headers })
  if (!res.ok) throw new Error(`Failed to get issue: ${res.status}`)
  return res.json()
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
