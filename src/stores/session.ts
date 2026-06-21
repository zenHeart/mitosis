import { defineStore } from 'pinia'
import type { ChatSession } from '../types/app'
import { listUserIssues, getIssueComments, createIssueComment } from '../composables/useGitHubAPI'

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
      const groups: Record<string, ChatSession[]> = {}
      for (const s of sorted) {
        const key = s.appLabel || '__ungrouped__'
        if (!groups[key]) groups[key] = []
        groups[key].push(s)
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
        const comments = await getIssueComments(token, repo, issueNumber)
        this.messages = comments.map((c) => ({
          id: `msg-${c.id}`,
          role: 'user' as const,
          content: c.body,
          createdAt: c.created_at,
          sanitized: true,
        }))
        // 回写 messageCount 到对应 session
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
