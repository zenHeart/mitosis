import type { BuildIssue, AppInfo } from '../types/app'

export async function createIssue(
  token: string,
  repo: string,
  title: string,
  body: string,
  labels: string[]
): Promise<BuildIssue> {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
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
  const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error(`Failed to get issue: ${res.status}`)
  return res.json()
}

export async function listApps(token: string, repo: string): Promise<AppInfo[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/apps`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) return []
  const items = await res.json()
  if (!Array.isArray(items)) return []

  const apps: AppInfo[] = []
  for (const item of items) {
    if (item.type === 'dir') {
      const versionsRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/apps/${item.name}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        }
      )
      if (versionsRes.ok) {
        const versions = await versionsRes.json()
        const versionDirs = Array.isArray(versions)
          ? versions.filter((v: { type: string }) => v.type === 'dir')
          : []
        const latestVersion = versionDirs.length
        apps.push({
          id: item.name,
          name: item.name,
          latestVersion,
          url: `/mitosis/apps/${item.name}/`,
          createdAt: item.created_at || '',
        })
      }
    }
  }
  return apps
}
