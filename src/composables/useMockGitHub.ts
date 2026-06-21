import type { ChatSession, IssueComment } from '../types/app'
import { maskSensitive } from './useSecurity'

const LS_KEY = 'mitosis_mock_sessions'

function readSessions(): ChatSession[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

function writeSessions(sessions: ChatSession[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(sessions))
}

function readMessages(issueNumber: number): IssueComment[] {
  try {
    const all = JSON.parse(localStorage.getItem(`${LS_KEY}_messages`) || '{}')
    return all[issueNumber] || []
  } catch {
    return []
  }
}

function writeMessages(issueNumber: number, messages: IssueComment[]) {
  try {
    const all = JSON.parse(localStorage.getItem(`${LS_KEY}_messages`) || '{}')
    all[issueNumber] = messages
    localStorage.setItem(`${LS_KEY}_messages`, JSON.stringify(all))
  } catch {
    // ignore
  }
}

let nextIssueNumber = 1000
function getNextIssueNumber(): number {
  const sessions = readSessions()
  const max = sessions.reduce((m, s) => Math.max(m, s.issueNumber), 0)
  return Math.max(max + 1, nextIssueNumber++)
}

// ── Mock API 函数 ──────────────────────────────────────────

export async function mockListUserIssues(_token: string, _repo: string): Promise<ChatSession[]> {
  return readSessions().filter((s) => s.status === 'open')
}

export async function mockGetIssueComments(
  _token: string,
  _repo: string,
  issueNumber: number
): Promise<IssueComment[]> {
  return readMessages(issueNumber)
}

export async function mockCreateIssueComment(
  _token: string,
  _repo: string,
  issueNumber: number,
  body: string
): Promise<IssueComment> {
  // 脱敏：存储前移除敏感字段
  const safeBody = maskSensitive(body)
  const comment: IssueComment = {
    id: Date.now(),
    body: safeBody,
    user: { login: 'mock-user' },
    created_at: new Date().toISOString(),
  }
  const messages = readMessages(issueNumber)
  messages.push(comment)
  writeMessages(issueNumber, messages)

  // 更新 session 的 updatedAt
  const sessions = readSessions()
  const idx = sessions.findIndex((s) => s.issueNumber === issueNumber)
  if (idx >= 0) {
    sessions[idx].updatedAt = comment.created_at
    sessions[idx].messageCount = messages.length
    writeSessions(sessions)
  }

  return comment
}

export async function mockCreateIssue(
  _token: string,
  _repo: string,
  title: string,
  body: string,
  labels: string[]
): Promise<{ number: number; title: string; state: string; body: string; labels: { name: string }[]; created_at: string; updated_at: string }> {
  const issueNumber = getNextIssueNumber()
  const now = new Date().toISOString()
  // 脱敏：存储前移除敏感字段
  const safeTitle = maskSensitive(title)
  const safeBody = maskSensitive(body)
  const issue = {
    number: issueNumber,
    title: safeTitle,
    state: 'open',
    body: safeBody,
    labels: labels.map((l) => ({ name: l })),
    created_at: now,
    updated_at: now,
  }

  const sessions = readSessions()
  sessions.push({
    issueNumber,
    title,
    status: 'open',
    labels,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
    appLabel: labels.find((l) => l.startsWith('app/')),
  })
  writeSessions(sessions)

  return issue
}

export async function mockGetIssue(
  _token: string,
  _repo: string,
  issueNumber: number
): Promise<{ number: number; title: string; state: string; body: string; labels: { name: string }[]; created_at: string; updated_at: string }> {
  const sessions = readSessions()
  const session = sessions.find((s) => s.issueNumber === issueNumber)
  if (!session) throw new Error(`Issue #${issueNumber} not found`)

  return {
    number: session.issueNumber,
    title: session.title,
    state: session.status,
    body: '',
    labels: session.labels.map((l: string) => ({ name: l })),
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  }
}

// ── /create 命令检测 ──────────────────────────────────────

export function detectCreateCommand(text: string): { triggered: boolean; description: string } {
  const trimmed = text.trim()
  // 精确匹配首字符 /create 或整行 /create
  const match = trimmed.match(/^\/create\s*(.*)$/)
  if (!match) return { triggered: false, description: '' }
  return {
    triggered: true,
    description: match[1]?.trim() || trimmed,
  }
}

// ── 工具函数 ──────────────────────────────────────────────

export function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_GITHUB === 'true'
}

export function clearMockData(): void {
  localStorage.removeItem(LS_KEY)
  localStorage.removeItem(`${LS_KEY}_messages`)
}
