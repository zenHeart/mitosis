import { defineStore } from 'pinia'
import type { AuthState, GitHubUser } from '../types/auth'
import { exchangeCodeForToken, fetchGitHubUser, saveSession } from '../composables/useAuth'

// @ts-ignore - injected at build time via vite define
// eslint-disable-next-line no-undef
declare const __GITHUB_TOKEN__: string

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: null,
    isAuthenticated: false,
    setupComplete: false,
    _oauthProcessing: false,
  }),

  actions: {
    setUser(user: GitHubUser) {
      this.user = user
      this.isAuthenticated = true
    },

    setToken(token: string) {
      this.token = token
    },

    setSetupComplete() {
      this.setupComplete = true
      if (typeof window !== 'undefined') {
        localStorage.setItem('mitosis_setup_complete', 'true')
      }
    },

    logout() {
      this.user = null
      this.token = null
      this.isAuthenticated = false
      this.setupComplete = false
      if (typeof window !== 'undefined') {
        sessionStorage.clear()
        localStorage.removeItem('mitosis_setup_complete')
        localStorage.removeItem('mitosis_token')
        localStorage.removeItem('mitosis_user')
      }
    },

    async init() {
      if (typeof window === 'undefined') return

      // ── 优先检查 sessionStorage（OAuth 登录态）────────────────
      let token = sessionStorage.getItem('mitosis_token')
      let userStr = sessionStorage.getItem('mitosis_user')
      const setupComplete = localStorage.getItem('mitosis_setup_complete') === 'true'

      // 如果 sessionStorage 为空，尝试从 localStorage 恢复（防止关闭标签页后丢失登录态）
      if (!token && !userStr) {
        token = localStorage.getItem('mitosis_token')
        userStr = localStorage.getItem('mitosis_user')
        if (token && userStr) {
          // 恢复后同步回 sessionStorage（当前标签页）
          sessionStorage.setItem('mitosis_token', token)
          sessionStorage.setItem('mitosis_user', userStr)
        }
      }

      if (token && userStr) {
        try {
          const user = JSON.parse(userStr) as GitHubUser
          this.token = token
          this.user = user
          this.isAuthenticated = true
          this.setupComplete = setupComplete
        } catch {
          this.clearSession()
        }
        return
      }

      // ── OAuth callback：exchange authorization code for token ──
      // 防止重复处理：如果正在处理 OAuth callback，直接返回
      if (this._oauthProcessing) return

      const oauthCode = sessionStorage.getItem('mitosis_oauth_code')
      if (oauthCode) {
        // 立即标记为处理中，防止并发或重复进入
        this._oauthProcessing = true
        // 立即移除 code，防止重复消费或重复触发
        sessionStorage.removeItem('mitosis_oauth_code')
        sessionStorage.removeItem('mitosis_oauth_redirect')
        try {
          const { access_token } = await exchangeCodeForToken(oauthCode)
          const githubUser = await fetchGitHubUser(access_token)
          const user: GitHubUser = {
            login: githubUser.login,
            id: githubUser.id,
            avatar_url: githubUser.avatar_url,
            html_url: githubUser.html_url,
            name: githubUser.name || githubUser.login,
          }
          saveSession(access_token, user)
          // 同时持久化到 localStorage，防止关闭标签页后丢失
          if (typeof window !== 'undefined') {
            localStorage.setItem('mitosis_token', access_token)
            localStorage.setItem('mitosis_user', JSON.stringify(user))
          }
          this.token = access_token
          this.user = user
          this.isAuthenticated = true
          this.setupComplete = setupComplete
        } catch {
          this.clearSession()
        } finally {
          this._oauthProcessing = false
        }
        return
      }

      // ── 本地开发：使用 Vite 注入的 token 自动登录 ──────────
      // 线上环境 (DEV=false) 不会走此分支
      if (import.meta.env.DEV && typeof __GITHUB_TOKEN__ === 'string' && __GITHUB_TOKEN__) {
        const devToken = __GITHUB_TOKEN__ as string
        try {
          const res = await fetch('/api/github/user', {
            headers: {
              Authorization: `Bearer ${devToken}`,
              Accept: 'application/vnd.github+json',
            },
          })
          if (res.ok) {
            const user = await res.json()
            this.token = devToken
            this.user = {
              login: user.login,
              id: user.id,
              avatar_url: user.avatar_url,
              html_url: user.html_url,
              name: user.name || user.login,
            }
            this.isAuthenticated = true
            // 持久化，避免每次刷新都调 API
            sessionStorage.setItem('mitosis_token', devToken)
            sessionStorage.setItem(
              'mitosis_user',
              JSON.stringify(this.user)
            )
          }
        } catch {
          // 本地 token 无效或网络不通，静默忽略
        }
      }
    },

    clearSession() {
      if (typeof window !== 'undefined') {
        sessionStorage.clear()
        localStorage.removeItem('mitosis_setup_complete')
        localStorage.removeItem('mitosis_token')
        localStorage.removeItem('mitosis_user')
      }
      this.user = null
      this.token = null
      this.isAuthenticated = false
      this.setupComplete = false
    },
  },
})
