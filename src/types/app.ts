export interface AppInfo {
  id: string
  name: string
  latestVersion: number
  url: string
  createdAt: string
}

export interface BuildIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  body: string
  labels: { name: string }[]
  created_at: string
}

// ── 会话管理系统类型 ──────────────────────────────────────

export interface IssueComment {
  id: number
  body: string
  user: { login: string; avatar_url?: string }
  created_at: string
}

export interface ChatSession {
  issueNumber: number
  title: string
  status: 'open' | 'closed'
  labels: string[]
  messageCount: number
  createdAt: string
  updatedAt: string
  appLabel?: string
}
