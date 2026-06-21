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
        this.sessions = await listUserIssues(token, repo)
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to load sessions'
        this.sessions = []
      } finally {
        this.loading = false
      }
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
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to send message'
      }
    },

    clearError() {
      this.error = null
    },
  },
})
