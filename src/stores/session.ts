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
        // 清除缓存中"同时带 platform + appLabel"的脏数据（旧版本遗留）
        const cleaned = cached.filter(s => !(s.labels?.includes('platform') && s.appLabel))
        const merged = this._mergeSessions(remoteSessions, cleaned)
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

    async refreshSessions(token: string, repo: string) {
      // 强制清除缓存，重新从远程加载（用于清理已关闭/无效的会话记录）
      this._clearCache()
      return this.loadSessions(token, repo)
    },

    // localStorage 缓存辅助方法
    _CACHE_KEY: 'mitosis_sessions_cache',
    _MESSAGES_CACHE_KEY: 'mitosis_messages_cache',

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

    _clearCache(): void {
      try {
        localStorage.removeItem(this._CACHE_KEY)
      } catch {
        // ignore
      }
    },

    // ── 消息持久化（pre-issue 创建期间，防止刷新丢失） ──
    _messagesKey(issueNumber?: number): string {
      return issueNumber ? `mitosis_messages_${issueNumber}` : 'mitosis_messages_pre'
    },

    _persistMessage(message: Message): void {
      try {
        const key = this._messagesKey(this.activeSession?.issueNumber)
        const existing: Message[] = (() => {
          try {
            const raw = localStorage.getItem(key)
            return raw ? JSON.parse(raw) : []
          } catch {
            return []
          }
        })()
        existing.push(message)
        localStorage.setItem(key, JSON.stringify(existing))
      } catch (e) {
        console.error('[PERSIST] failed:', e)
      }
    },

    restoreMessages(issueNumber?: number): Message[] {
      try {
        const key = this._messagesKey(issueNumber)
        const raw = localStorage.getItem(key)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        this.messages = parsed
        return parsed
      } catch {
        return []
      }
    },

    clearMessages(issueNumber?: number): void {
      this.messages = []
      try {
        const key = this._messagesKey(issueNumber)
        localStorage.removeItem(key)
      } catch {
        // ignore
      }
    },

    _mergeSessions(remote: ChatSession[], cached: ChatSession[]): ChatSession[] {
      const map = new Map<number, ChatSession>()
      // 先载入远程数据（权威来源），再用本地缓存补充
      for (const s of remote) {
        map.set(s.issueNumber, { ...s })
      }
      // 合并本地缓存的消息计数等本地属性
      for (const s of cached) {
        const existing = map.get(s.issueNumber)
        if (!existing) {
          map.set(s.issueNumber, { ...s })
        } else {
          // 远程数据覆盖 appLabel/scenario/labels，只保留本地消息计数
          map.set(s.issueNumber, {
            ...existing,
            messageCount: Math.max(existing.messageCount || 0, s.messageCount || 0),
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
        if (this.activeSession?.issueNumber !== issueNumber) return false
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
        // 内部控制评论只用于触发工作流，不是用户聊天内容。
        const visibleComments = comments.filter(c => !/^\/(?:create|start|stop|status)\s*$/i.test(c.body.trim()))
        msgs.push(...visibleComments.map((c) => ({
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
        return true
      } catch (e) {
        if (this.activeSession?.issueNumber !== issueNumber) return false
        this.error = e instanceof Error ? e.message : 'Failed to load messages'
        this.messages = []
        return false
      } finally {
        if (this.activeSession?.issueNumber === issueNumber) this.loading = false
      }
    },

    setActiveSession(session: ChatSession | null) {
      this.activeSession = session
      if (!session) {
        this.messages = []
      } else {
        // 恢复该会话的本地消息缓存
        this.restoreMessages(session.issueNumber)
      }
    },

    addMessage(message: Message) {
      const msg = {
        ...message,
        id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }
      this.messages.push(msg)
      // 持久化：防止页面刷新丢失（pre-issue 或 issue 创建前）
      this._persistMessage(msg)
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
      if (session.status === 'closed') return '已关闭'
      if (labels.includes('status:review')) return '等待审查'
      if (labels.includes('status:verifying')) return '验证中'
      if (labels.includes('status:building')) return '构建中'
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
