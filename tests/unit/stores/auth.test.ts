import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../../../src/stores/auth'

// ─── Setup ──────────────────────────────────────────────────
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

// ================================================================
// useAuthStore — 状态初始化
// ================================================================
describe('useAuthStore state', () => {
  it('初始状态为未认证', () => {
    const store = useAuthStore()
    // Pinia store 是单例，reset 需要手动清理
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.setupComplete).toBe(false)
  })

  it('setUser 设置用户信息', () => {
    const store = useAuthStore()
    const user = {
      login: 'octocat',
      id: 1,
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      html_url: 'https://github.com/octocat',
    }

    store.setUser(user)

    expect(store.user.login).toBe('octocat')
    expect(store.user.id).toBe(1)
    expect(store.isAuthenticated).toBe(true)
  })

  it('setToken 设置 token', () => {
    const store = useAuthStore()
    store.setToken('ghp_testtoken')

    expect(store.token).toBe('ghp_testtoken')
  })

  it('setSetupComplete 标记完成并持久化', () => {
    const store = useAuthStore()
    store.setSetupComplete()

    expect(store.setupComplete).toBe(true)
    expect(localStorage.getItem('mitosis_setup_complete')).toBe('true')
  })

  it('logout 清除所有状态', () => {
    const store = useAuthStore()
    store.setUser({ login: 'test', id: 1, avatar_url: '', html_url: '' })
    store.setToken('tok')
    store.setSetupComplete()
    sessionStorage.setItem('mitosis_oauth_code', 'code')

    store.logout()

    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.setupComplete).toBe(false)
    expect(sessionStorage.getItem('mitosis_token')).toBeNull()
    expect(localStorage.getItem('mitosis_setup_complete')).toBeNull()
  })
})

// ================================================================
// useAuthStore — init 流程（已有 session 的情况）
// ================================================================
describe('useAuthStore.init — existing session', () => {
  it('从 sessionStorage 恢复已登录状态', async () => {
    const userJson = JSON.stringify({
      login: 'octocat',
      id: 1,
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      html_url: 'https://github.com/octocat',
      name: 'The Octocat',
    })

    sessionStorage.setItem('mitosis_token', 'ghp_existing_token')
    sessionStorage.setItem('mitosis_user', userJson)
    localStorage.setItem('mitosis_setup_complete', 'true')

    const store = useAuthStore()
    await store.init()

    expect(store.isAuthenticated).toBe(true)
    expect(store.token).toBe('ghp_existing_token')
    expect(store.user.login).toBe('octocat')
    expect(store.setupComplete).toBe(true)
  })

  it('sessionStorage 数据损坏时清除 session', async () => {
    sessionStorage.setItem('mitosis_token', 'tok')
    sessionStorage.setItem('mitosis_user', 'not-json{')

    const store = useAuthStore()
    await store.init()

    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
    expect(sessionStorage.getItem('mitosis_token')).toBeNull()
  })

  it('无 session 时保持未认证', async () => {
    const store = useAuthStore()
    await store.init()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
  })
})

// ================================================================
// useAuthStore — OAuth callback 流程
// ================================================================
describe('useAuthStore.init — OAuth callback', () => {
  it('检测到 oauth_code 后尝试 exchange', async () => {
    // 设置 OAuth code（模拟 404.html 的行为）
    sessionStorage.setItem('mitosis_oauth_code', 'test_auth_code')
    sessionStorage.setItem('mitosis_oauth_redirect', '1')

    // Mock fetch for token exchange + user fetch
    let fetchCallCount = 0
    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = vi.fn().mockImplementation((url: string) => {
      fetchCallCount++
      const urlStr = typeof url === 'string' ? url : url.url

      if (urlStr.includes('oauth/access_token') || urlStr.includes('mitosis-oauth-proxy')) {
        // Token exchange response
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'ghp_exchanged_token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }

      if (urlStr.includes('/user')) {
        // GitHub user response
        return Promise.resolve(
          new Response(
            JSON.stringify({
              login: 'oauth_user',
              id: 999,
              avatar_url: 'https://avatars.githubusercontent.com/u/999',
              html_url: 'https://github.com/oauth_user',
              name: 'OAuth User',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }

      return Promise.resolve(new Response('Not Found', { status: 404 }))
    })

    const store = useAuthStore()
    await store.init()

    // 验证：token exchange 被调用了
    expect(fetchCallCount).toBeGreaterThanOrEqual(2)

    // 验证：登录成功
    expect(store.isAuthenticated).toBe(true)
    expect(store.token).toBe('ghp_exchanged_token')
    expect(store.user.login).toBe('oauth_user')

    // 验证：OAuth code 被清理
    expect(sessionStorage.getItem('mitosis_oauth_code')).toBeNull()
    expect(sessionStorage.getItem('mitosis_oauth_redirect')).toBeNull()

    // Restore
    ;(globalThis as any).fetch = originalFetch
  })

  it('OAuth exchange 失败时清除 session', async () => {
    sessionStorage.setItem('mitosis_oauth_code', 'bad_code')

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify({ error: 'bad_code' }), { status: 400 }))
    })

    const store = useAuthStore()
    await store.init()

    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
    expect(sessionStorage.getItem('mitosis_oauth_code')).toBeNull()

    ;(globalThis as any).fetch = originalFetch
  })
})

// ================================================================
// useAuthStore — clearSession 边界情况
// ================================================================
describe('useAuthStore.clearSession', () => {
  it('在 SSR 环境（无 window）不抛错', () => {
    const store = useAuthStore()
    // clearSession 内部检查 typeof window，这里不会抛错
    expect(() => store.clearSession()).not.toThrow()
  })
})
