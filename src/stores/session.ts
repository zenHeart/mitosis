import { defineStore } from 'pinia'
import type { ChatSession } from '../types/app'
import { listUserIssues, getIssue, getIssueComments, createIssueComment } from '../composables/useGitHubAPI'
import { markdownToHtml } from '../composables/useSanitize'

export interface Message {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  sanitized?: boolean
}

export interface SessionState {
  sessions: ChatSession[]
  activeSession: ChatSession | null
  messages: Message[]
  loading: boolean
  error: string | null
}

export interface AgentStatusResult {
  label: string
  text: string
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    sessions: [],
    activeSession: null,
    messages: [],
    loading: false,
    error: null,
  }),

  getters: {
    activeMessages: (state) => state.messages,
    hasActiveSession: (state) => state.activeSession !== null,
    sortedSessions: (state) =>
      [...state.sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    groupedSessions: (state) => {
      const sorted = [...state.sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      const groups: { platform: ChatSession[]; app: ChatSession[]; other: ChatSession[] } = { platform: [], app: [], other: [] }
      for (const s of sorted) {
        const labels = s.labels || []
        const isPlatform = labels.includes('platform') || labels.includes('needs-review')
        const appLabel = s.appLabel
        if (isPlatform) {
          groups.platform.push(s)
        } else if (appLabel) {
          groups.app.push(s)
        } else {
          groups.other.push(s)
        }
      }
      return groups
    },
  },

  actions: {
    async loadSessions(token: string, repo: string) {
      this.loading = true
      this.error = null
      try {
        const remoteSessions = await listUserIssues(token, repo)
        // 合并远程 sessions 与本地缓存（去重：以 issueNumber 为准）
        const cached = this._readCache()
        const merged = this._mergeSessions(remoteSessions, cached)
        this.sessions = merged
        this._writeCache(merged)
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to load sessions'
        // API 失败时，从 localStorage 恢复缓存
        const cached = this._readCache()
        if (cached.length > 0) {
          this.sessions = cached
        }
      } finally {
        this.loading = false
      }
    },

    // localStorage 缓存辅助方法
    _CACHE_KEY: 'mitosis_sessions_cache',

    _readCache(): ChatSession[] {
      try {
        const raw = localStorage.getItem(this._CACHE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        // 过滤过期数据（超过 24 小时）
        const dayMs = 86400000
        const now = Date.now()
        return parsed.filter((s: ChatSession) => {
          const updated = new Date(s.updatedAt).getTime()
          return !Number.isNaN(updated) && now - updated < dayMs
        })
      } catch {
        return []
      }
    },

    _writeCache(sessions: ChatSession[]): void {
      try {
        localStorage.setItem(this._CACHE_KEY, JSON.stringify(sessions))
      } catch {
        // ignore quota exceeded
      }
    },

    _mergeSessions(remote: ChatSession[], cached: ChatSession[]): ChatSession[] {
      const map = new Map<number, ChatSession>()
      // 优先远程数据（更新），补充本地独有数据
      for (const s of [...cached, ...remote]) {
        const existing = map.get(s.issueNumber)
        if (!existing) {
          map.set(s.issueNumber, s)
        } else {
          // 合并：远程数据覆盖，但保留本地消息计数
          map.set(s.issueNumber, {
            ...s,
            messageCount: Math.max(s.messageCount, existing.messageCount),
          })
        }
      }
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    },

    async loadMessages(token: string, repo: string, issueNumber: number) {
      this.loading = true
      this.error = null
      try {
        const [issue, comments] = await Promise.all([
          getIssue(token, repo, issueNumber),
          getIssueComments(token, repo, issueNumber),
        ])
        const msgs: Message[] = []
        // Issue body 作为第一条消息（需求描述/AI 分析等上下文）
        if (issue.body) {
          msgs.push({
            id: `issue-body-${issue.number}`,
            role: 'system',
            content: markdownToHtml(issue.body),
            createdAt: issue.created_at,
            sanitized: true,
          })
        }
        // Comments 作为后续消息
        msgs.push(...comments.map((c) => ({
          id: `msg-${c.id}`,
          role: 'user' as const,
          content: markdownToHtml(c.body),
          createdAt: c.created_at,
          sanitized: true,
        })))
        this.messages = msgs
        // 回写 messageCount 到对应 session（含 body 共 +1）
        const session = this.sessions.find((s) => s.issueNumber === issueNumber)
        if (session) {
          session.messageCount = this.messages.length
        }
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to load messages'
        this.messages = []
      } finally {
        this.loading = false
      }
    },

    setActiveSession(session: ChatSession | null) {
      this.activeSession = session
      if (!session) {
        this.messages = []
      }
    },

    addMessage(message: Message) {
      this.messages.push({
        ...message,
        id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
    },

    async sendMessage(token: string, repo: string, issueNumber: number, content: string) {
      const userMsg: Message = {
        id: `msg-local-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      }
      this.addMessage(userMsg)

      try {
        await createIssueComment(token, repo, issueNumber, content)
        // 更新 session 的 updatedAt 并刷新缓存
        const session = this.sessions.find(s => s.issueNumber === issueNumber)
        if (session) {
          session.updatedAt = userMsg.createdAt
          session.messageCount = this.messages.length
          this._writeCache(this.sessions)
        }
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to send message'
      }
    },

    clearError() {
      this.error = null
    },

    // 根据 labels 推导显示状态
    getSessionDisplayStatus(session: ChatSession): string {
      const labels = session.labels || []
      if (labels.includes('status:cancelled')) return '已停止'
      if (labels.includes('status:failed')) return '构建失败'
      if (labels.includes('status:review')) return '等待审查'
      if (labels.includes('status:verifying')) return '验证中'
      if (labels.includes('status:building')) return '构建中'
      if (session.status === 'closed') return '已关闭'
      return '进行中'
    },

    async checkAgentStatus(token: string, repo: string, issueNumber: number) {
      const issue = await getIssue(token, repo, issueNumber)
      const statusLabel = issue.labels.find((l: { name: string }) => l.name.startsWith('status:'))
      const statusMap: Record<string, string> = {
        'status:building': '🔨 构建中...',
        'status:verifying': '🔎 验证中...',
        'status:review': '✅ 等待人工审查',
        'status:failed': '❌ 构建失败',
        'status:cancelled': '🛑 已停止',
      }
      const text = statusLabel ? (statusMap[statusLabel.name] || '💤 空闲') : '💤 空闲'
      return { label: statusLabel?.name || '', text }
    },
  },
})
