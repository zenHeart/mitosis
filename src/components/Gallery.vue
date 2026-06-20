<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import type { AppInfo } from '../types/app'
import { useAuthStore } from '../stores/auth'
import { getLoginUrl } from '../composables/useAuth'
import { REPO_FULL_NAME } from '../config/repo'
import { listApps } from '../composables/useGitHubAPI'

const props = defineProps<{
  initialApp?: string
}>()

// ── 本地 fallback 数据（当 GitHub API 不可用时使用）─────────────────
const LOCAL_APPS: AppInfo[] = [
  { id: 'tetris-game', name: '俄罗斯方块', latestVersion: 1, url: '/apps/tetris-game/v1/', createdAt: '' },
  { id: 'snake-game',   name: '贪吃蛇',   latestVersion: 1, url: '/apps/snake-game/v1/',   createdAt: '' },
]

// ── State ──────────────────────────────────────────────────────────
const authStore = useAuthStore()
const isLoggedIn = computed(() => !!authStore.token)

const apps = ref<AppInfo[]>([])
const loading = ref(true)
const error = ref('')
const selectedApp = ref<string | undefined>(props.initialApp)
const selectedCardRef = ref<HTMLElement | null>(null)
const appsGridRef = ref<HTMLElement | null>(null)

function setSelectedCard(el: HTMLElement | null) {
  selectedCardRef.value = el
}

function scrollToApps() {
  appsGridRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleLogin() {
  window.location.href = getLoginUrl()
}

function openApp(app: AppInfo) {
  selectedApp.value = app.id
  window.location.href = app.url
}

watch(selectedApp, async (newApp) => {
  if (!newApp) return
  await nextTick()
  selectedCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

onMounted(async () => {
  try {
    // 优先使用带 token 的 API（DEV 走 Vite proxy → github-proxy → api.github.com）
    // 本地自动登录模式下 authStore.token 已被注入
    const apiApps = await listApps(authStore.token || '', REPO_FULL_NAME)
    if (apiApps.length > 0) {
      apps.value = apiApps
    } else {
      // API 返回空或超时：使用本地 fallback
      apps.value = LOCAL_APPS
    }
  } catch (e) {
    // API 失败：使用本地 fallback 数据
    apps.value = LOCAL_APPS
    error.value = ''
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="gallery">
    <header class="gallery-header">
      <div class="brand">
        <span class="logo">🧬</span>
        <h1>Mitosis</h1>
      </div>
      <p class="tagline">AI 构建 AI，无限繁衍</p>
    </header>

    <main class="gallery-main">
      <section class="hero">
        <h2>探索 AI 构建的应用</h2>
        <p>以下应用由 AI Agent 自动构建，全部代码开源。</p>
      </section>

      <section class="apps-section">
        <div v-if="loading" class="status">加载中...</div>
        <div v-else-if="error" class="status error">{{ error }}</div>
        <div v-else-if="apps.length === 0" class="status empty">
          暂无应用，登录后可以开始构建。
        </div>
        <div v-else class="apps-grid" ref="appsGridRef">
          <div
            v-for="app in apps"
            :key="app.id"
            :ref="(el) => setSelectedCard(selectedApp === app.id ? el as HTMLElement : null)"
            :class="['app-item', { selected: selectedApp === app.id }]"
            @click="openApp(app)"
          >
            <div class="app-icon">📦</div>
            <div class="app-details">
              <span class="app-name">{{ app.name }}</span>
              <span class="app-version">v{{ app.latestVersion }}</span>
            </div>
            <span class="app-action">打开 →</span>
          </div>
        </div>
      </section>

      <section class="cta-section">
        <p v-if="isLoggedIn">想构建自己的应用？</p>
        <p v-else>想构建自己的应用？登录后即可使用 AI 构建。</p>
        <div class="cta-buttons">
          <button @click="scrollToApps" class="cta-btn cta-browse">
            🎮 浏览应用
          </button>
          <button
            v-if="!isLoggedIn"
            @click="handleLogin"
            class="cta-btn cta-login"
          >
            🔨 使用 GitHub 登录后创建自己的应用
          </button>
        </div>
      </section>
    </main>

    <footer class="gallery-footer">
      <p>Powered by <a :href="`https://github.com/${REPO_FULL_NAME}`" target="_blank" rel="noopener">Mitosis</a> · MIT License</p>
    </footer>
  </div>
</template>

<style scoped>
.gallery {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.gallery-header {
  text-align: center;
  padding: 3rem 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.logo {
  font-size: 2.5rem;
}

.brand h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.tagline {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.gallery-main {
  flex: 1;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.hero {
  text-align: center;
  margin-bottom: 2.5rem;
}

.hero h2 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.hero p {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.apps-section {
  margin-bottom: 3rem;
}

.status {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.status.error {
  color: var(--error);
}

.status.empty {
  color: #666;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.app-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.app-item:hover {
  border-color: var(--accent);
  background: var(--bg-tertiary);
  transform: translateY(-1px);
}

.app-item.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.app-icon {
  font-size: 1.75rem;
  flex-shrink: 0;
}

.app-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.app-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-version {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  align-self: fit-content;
}

.app-action {
  font-size: 0.8rem;
  color: var(--accent);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.app-item:hover .app-action {
  opacity: 1;
}

.cta-section {
  text-align: center;
  padding: 2rem;
  border-top: 1px solid var(--border);
}

.cta-section p {
  color: var(--text-secondary);
  margin-bottom: 1rem;
  font-size: 0.95rem;
}

.cta-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.cta-browse {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.cta-browse:hover {
  border-color: var(--accent);
  background: var(--bg-tertiary);
}

.cta-login {
  background: var(--accent);
  color: #fff;
}

.cta-login:hover {
  opacity: 0.9;
}

.cta-btn {
  display: inline-block;
  padding: 0.75rem 2rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
  transition: all 0.2s;
  cursor: pointer;
  border: none;
}

.cta-btn:hover {
  transform: translateY(-1px);
}

.gallery-footer {
  text-align: center;
  padding: 1.5rem;
  border-top: 1px solid var(--border);
  color: #555;
  font-size: 0.8rem;
}

.gallery-footer a {
  color: var(--accent);
  text-decoration: none;
}

.gallery-footer a:hover {
  text-decoration: underline;
}
</style>
