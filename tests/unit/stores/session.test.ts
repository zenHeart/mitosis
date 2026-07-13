import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getIssue, getIssueComments } = vi.hoisted(() => ({
  getIssue: vi.fn(),
  getIssueComments: vi.fn(),
}))

vi.mock('../../../src/composables/useGitHubAPI', () => ({
  listUserIssues: vi.fn().mockResolvedValue([]),
  getIssue,
  getIssueComments,
  createIssueComment: vi.fn(),
}))

import { useSessionStore } from '../../../src/stores/session'
import type { ChatSession } from '../../../src/types/app'

function chatSession(issueNumber: number): ChatSession {
  return {
    issueNumber,
    title: `platform task ${issueNumber}`,
    status: 'open',
    labels: ['platform'],
    messageCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  const store = useSessionStore()
  store.$reset()
  getIssue.mockReset()
  getIssueComments.mockReset()
  getIssue.mockResolvedValue({
    number: 41,
    title: 'platform task',
    state: 'open',
    body: '需求正文',
    labels: [{ name: 'platform' }],
    created_at: '2026-01-01T00:00:00Z',
  })
})

describe('session message history', () => {
  it('hides workflow control comments from the user conversation', async () => {
    getIssueComments.mockResolvedValue([
      { id: 1, body: '/create', user: { login: 'owner' }, created_at: '2026-01-01T00:01:00Z' },
      { id: 2, body: '/status', user: { login: 'owner' }, created_at: '2026-01-01T00:02:00Z' },
      { id: 3, body: '普通用户消息', user: { login: 'owner' }, created_at: '2026-01-01T00:03:00Z' },
    ])

    const store = useSessionStore()
    store.setActiveSession(chatSession(41))
    await store.loadMessages('test-token', 'owner/repo', 41)

    expect(store.messages).toHaveLength(2)
    expect(store.messages.some(message => message.content.includes('/create'))).toBe(false)
    expect(store.messages.some(message => message.content.includes('/status'))).toBe(false)
    expect(store.messages.at(-1)?.content).toContain('普通用户消息')
  })

  it('does not let a stale session response overwrite the newly selected session', async () => {
    let resolveOldIssue!: (value: unknown) => void
    let resolveOldComments!: (value: unknown) => void
    const oldIssue = new Promise(resolve => { resolveOldIssue = resolve })
    const oldComments = new Promise(resolve => { resolveOldComments = resolve })
    getIssue.mockImplementation((_token, _repo, issueNumber) => issueNumber === 41
      ? oldIssue
      : Promise.resolve({
          number: 42,
          title: 'new session',
          state: 'open',
          body: '新会话正文',
          labels: [{ name: 'platform' }],
          created_at: '2026-01-01T00:00:00Z',
        }))
    getIssueComments.mockImplementation((_token, _repo, issueNumber) => issueNumber === 41
      ? oldComments
      : Promise.resolve([]))

    const store = useSessionStore()
    store.setActiveSession(chatSession(41))
    const oldLoad = store.loadMessages('test-token', 'owner/repo', 41)
    store.setActiveSession(chatSession(42))
    await store.loadMessages('test-token', 'owner/repo', 42)
    resolveOldIssue({
      number: 41,
      title: 'old session',
      state: 'open',
      body: '旧会话正文',
      labels: [{ name: 'platform' }],
      created_at: '2026-01-01T00:00:00Z',
    })
    resolveOldComments([])
    await oldLoad

    expect(store.activeSession?.issueNumber).toBe(42)
    expect(store.messages.map(message => message.content).join(' ')).toContain('新会话正文')
    expect(store.messages.map(message => message.content).join(' ')).not.toContain('旧会话正文')
  })
})
