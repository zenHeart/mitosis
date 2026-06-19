import { defineStore } from 'pinia'
import type { AuthState, GitHubUser } from '../types/auth'

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: null,
    isAuthenticated: false,
    setupComplete: false,
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
      }
    },

    async init() {
      if (typeof window === 'undefined') return

      const token = sessionStorage.getItem('mitosis_token')
      const userStr = sessionStorage.getItem('mitosis_user')
      const setupComplete = localStorage.getItem('mitosis_setup_complete') === 'true'

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
      }
    },

    clearSession() {
      if (typeof window !== 'undefined') {
        sessionStorage.clear()
        localStorage.removeItem('mitosis_setup_complete')
      }
      this.user = null
      this.token = null
      this.isAuthenticated = false
      this.setupComplete = false
    },
  },
})
