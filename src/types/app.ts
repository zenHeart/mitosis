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
