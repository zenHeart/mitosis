<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { getLoginUrl, getImplicitLoginUrl, extractTokenFromHash, fetchGitHubUser, saveSession } from '../composables/useAuth'

const authStore = useAuthStore()
const loading = ref(false)
const error = ref('')

onMounted(() => {
  // If redirected from 404.html (GitHub Pages SPA fallback),
  // the OAuth code was saved to sessionStorage by 404.html
  const savedCode = sessionStorage.getItem('mitosis_oauth_code')
  if (savedCode) {
    sessionStorage.removeItem('mitosis_oauth_code')
    sessionStorage.removeItem('mitosis_oauth_redirect')
    window.location.replace(getImplicitLoginUrl())
    return
  }

  // If GitHub returned an authorization code (Authorization Code Flow),
  // redirect to Implicit Flow which returns the token directly
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (code) {
    window.location.replace(getImplicitLoginUrl())
    return
  }

  const hash = window.location.hash
  if (hash && hash.includes('access_token')) {
    handleCallback(hash)
  }
})

async function handleCallback(hash: string) {
  loading.value = true
  error.value = ''
  try {
    const token = extractTokenFromHash(hash)
    if (!token) {
      error.value = '无法获取访问令牌'
      return
    }
    const user = await fetchGitHubUser(token)
    saveSession(token, user)
    authStore.setToken(token)
    authStore.setUser(user)
    window.location.hash = ''
    emit('login-success')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}

function handleLogin() {
  window.location.href = getLoginUrl()
}

const emit = defineEmits<{
  (e: 'login-success'): void
}>()
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="logo">🧬</h1>
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
  padding: 3rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 400px;
  width: 90%;
}

.logo {
  font-size: 3rem;
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
  margin-bottom: 2rem;
  font-size: 0.95rem;
}

.github-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: #24292e;
  color: #fff;
  border: 1px solid #444;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s;
}

.github-btn:hover:not(:disabled) {
  background: #2f363d;
  border-color: #666;
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
  margin-top: 1rem;
  font-size: 0.875rem;
}
</style>
