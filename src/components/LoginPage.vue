<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import {
  getLoginUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  saveSession,
} from '../composables/useAuth'
import { Dna } from '@lucide/vue'

const authStore = useAuthStore()
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  // Authorization Code Flow:
  // 1. 404.html stores the `code` in sessionStorage and redirects to /
  // 2. Here we read the code from sessionStorage and exchange it for a token
  //    via the Cloudflare Worker proxy (bypassing CORS restrictions)
  const code = sessionStorage.getItem('mitosis_oauth_code')
  if (!code) return

  try {
    loading.value = true
    const { access_token } = await exchangeCodeForToken(code)
    const user = await fetchGitHubUser(access_token)
    saveSession(access_token, user)
    authStore.setToken(access_token)
    authStore.setUser(user)
    // Clean up
    sessionStorage.removeItem('mitosis_oauth_code')
    window.history.replaceState(null, '', '/')
    emit('login-success')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
})

async function handleLogin() {
  loading.value = true
  window.location.href = getLoginUrl()
}

const emit = defineEmits<{
  (e: 'login-success'): void
}>()
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="logo"><Dna :size="48" stroke-width="2" /></h1>
      <h1 class="title">Mitosis</h1>
      <p class="subtitle">AI 构建 AI，无限繁衍</p>
      <button @click="handleLogin" class="github-btn" :disabled="loading">
        <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor" width="24" height="24">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        {{ loading ? '登录中...' : '使用 GitHub 登录' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.login-card {
  text-align: center;
  padding: 2rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 400px;
  width: 90%;
}

.logo {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.subtitle {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.github-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1.5rem;
  min-height: 44px;
  background: var(--github-bg);
  color: #fff;
  border: 1px solid var(--github-border);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  cursor: pointer;
}

.github-btn:hover:not(:disabled) {
  background: var(--github-bg-hover);
  border-color: var(--github-border-hover);
  transform: translateY(-1px);
}

.github-btn:active:not(:disabled) {
  transform: translateY(0);
}

.github-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.github-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.github-icon {
  flex-shrink: 0;
}

.error {
  color: var(--error);
  margin-top: 0.75rem;
  font-size: 0.875rem;
}
</style>
