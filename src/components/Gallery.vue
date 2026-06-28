<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import type { AppInfo, ChatSession } from '../types/app'
import { useAuthStore } from '../stores/auth'
import { useSessionStore } from '../stores/session'
import { getLoginUrl } from '../composables/useAuth'
import { REPO_FULL_NAME } from '../config/repo'
import { listApps } from '../composables/useGitHubAPI'
import { useDarkMode } from '../composables/useDarkMode'

const props = defineProps<{
  initialApp?: string
}>()

// ── 本地 fallback 数据（当 GitHub API 不可用时使用）─────────────────
const LOCAL_APPS: AppInfo[] = [
  { id: 'tetris-game', name: '俄罗斯方块 v2', latestVersion: 2, url: '/apps/tetris-game/v2/', createdAt: '' },
]

// ── State ──────────────────────────────────────────────────────────
const authStore = useAuthStore()
const sessionStore = useSessionStore()
const isLoggedIn = computed(() => !!authStore.token)

const apps = ref<AppInfo[]>(LOCAL_APPS)
const loading = ref(true)
const error = ref('')
const selectedApp = ref<string | undefined>(props.initialApp)
const selectedSession = ref<number | undefined>(props.initialApp ? undefined : undefined)
const selectedCardRef = ref<HTMLElement | null>(null)
const appsGridRef = ref<HTMLElement | null>(null)
const sidebarOpen = ref(false)
const loginLoading = ref(false)

const sessionGroups = computed(() => {
  const raw = sessionStore.groupedSessions as { platform: ChatSession[]; app: ChatSession[]; other: ChatSession[] }
  return [
    { key: 'platform', label: '🔧 平台', sessions: raw.platform },
    { key: 'app', label: '📱 应用', sessions: raw.app },
    { key: 'other', label: '📋 其他', sessions: raw.other },
  ].filter((g) => g.sessions.length > 0)
})

const { theme: darkMode, toggle: toggleDarkMode, init: initDarkMode } = useDarkMode()

function setSelectedCard(el: HTMLElement | null) {
  selectedCardRef.value = el
}

function selectSession(issueNumber: number) {
  selectedSession.value = issueNumber
  window.location.hash = `#session=${issueNumber}`
}

function scrollToApps() {
  appsGridRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleLogin() {
  loginLoading.value = true
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
  // 初始化暗黑模式
  initDarkMode()

  // 加载会话列表
  if (isLoggedIn.value) {
    await sessionStore.loadSessions(authStore.token || '', REPO_FULL_NAME)
  }

  // 从 URL hash 恢复选中的 session
  const hash = window.location.hash
  if (hash.startsWith('#session=')) {
    const num = parseInt(hash.replace('#session=', ''))
    if (!isNaN(num)) selectedSession.value = num
  }

  try {
    const apiApps = await listApps(authStore.token || '', REPO_FULL_NAME)
    if (apiApps.length > 0) {
      apps.value = apiApps
    } else {
      apps.value = LOCAL_APPS
    }
  } catch (e) {
    apps.value = LOCAL_APPS
    error.value = ''
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="gallery">
    <!-- 会话侧边栏（登录后可见）────────────────────────────── -->
    <aside v-if="isLoggedIn" class="session-sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <h3>会话</h3>
        <button class="sidebar-close" @click="sidebarOpen = false">×</button>
      </div>
      <div class="sidebar-sessions">
        <div
          v-for="group in sessionGroups"
          :key="group.key"
          class="session-group"
        >
          <div class="group-label">{{ group.label }}</div>
          <div
            v-for="session in group.sessions"
            :key="session.issueNumber"
            :class="['session-item', { active: selectedSession === session.issueNumber }]"
            @click="selectSession(session.issueNumber)"
          >
            <span class="session-title">{{ session.title }}</span>
            <span class="session-status" :class="session.status">{{ session.status }}</span>
          </div>
        </div>
      </div>
    </aside>

    <header class="gallery-header">
      <div class="brand">
        <button v-if="isLoggedIn" class="sidebar-toggle" @click="sidebarOpen = !sidebarOpen">☰</button>
        <span class="logo">🧬</span>
        <h1>Mitosis</h1>
        <button class="theme-toggle" @click="toggleDarkMode" :title="darkMode === 'dark' ? '切换到亮色模式' : '切换到暗黑模式'">
          {{ darkMode === 'dark' ? '☀️' : '🌙' }}
        </button>
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
        <p v-if="isLoggedIn">想构建自己的应用？进入 Workspace 开始。</p>
        <p v-else>想构建自己的应用？仅仓库所有者登录后可使用 AI 构建。</p>
        <div class="cta-buttons">
          <button @click="scrollToApps" class="cta-btn cta-browse">
            🎮 浏览应用
          </button>
          <button
            v-if="!isLoggedIn"
            @click="handleLogin"
            class="cta-btn cta-login"
            :disabled="loginLoading"
          >
            {{ loginLoading ? '跳转中...' : '🔨 使用 GitHub 登录后创建自己的应用' }}
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

@media (min-width: 1024px) {
  .gallery-main {
    max-width: none;
    margin: 0;
  }
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  line-height: 1.3;
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

/* ── 会话侧边栏 ──────────────────────────────────────────── */
.session-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  height: 100vh;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  z-index: 100;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
  display: flex;
  flex-direction: column;
}

.session-sidebar.open {
  transform: translateX(0);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.sidebar-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.sidebar-close:hover {
  color: var(--text-primary);
}

.sidebar-sessions {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.session-group {
  margin-bottom: 0.75rem;
}

.group-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  padding: 0.5rem 0.75rem;
  font-weight: 600;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 0.5rem;
}

.session-item:hover {
  background: var(--bg-tertiary);
}

.session-item.active {
  background: var(--accent-glow);
  border: 1px solid var(--accent);
}

.session-title {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  line-height: 1.3;
  word-break: break-word;
}

.session-status {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  flex-shrink: 0;
}

.session-status.open {
  background: #1a7f37;
  color: #fff;
}

.session-status.closed {
  background: #666;
  color: #fff;
}

.sidebar-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 1.2rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.3rem 0.6rem;
  margin-right: 0.5rem;
  transition: all 0.15s;
}

.sidebar-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.theme-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 1.2rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.3rem 0.6rem;
  margin-left: 0.5rem;
  transition: all 0.15s;
  line-height: 1;
}

.theme-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
  transform: scale(1.1);
}

/* ── 移动端适配 ─────────────────────────────────────────── */
@media (max-width: 640px) {
  .gallery-header {
    padding: 1.5rem 1rem 1rem;
  }

  .brand h1 {
    font-size: 1.5rem;
  }

  .logo {
    font-size: 1.75rem;
  }

  .tagline {
    font-size: 0.85rem;
  }

  .gallery-main {
    padding: 1rem;
  }

  .hero h2 {
    font-size: 1.25rem;
  }

  .apps-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .app-item {
    padding: 0.75rem;
  }

  .cta-buttons {
    flex-direction: column;
    gap: 0.75rem;
  }

  .cta-btn {
    width: 100%;
    padding: 0.875rem 1.5rem;
  }

  /* 侧边栏在移动端作为遮罩层 */
  .session-sidebar {
    width: 85vw;
    max-width: 320px;
  }

  .sidebar-toggle {
    min-height: 44px;
    min-width: 44px;
  }
}

/* 确保所有可点击元素在移动端有足够大的触摸区域 */
@media (pointer: coarse) {
  .theme-toggle,
  .sidebar-toggle,
  .sidebar-close,
  .app-item,
  .cta-btn {
    min-height: 44px;
    min-width: 44px;
  }
}

@media (min-width: 1024px) {
  .session-sidebar {
    transform: translateX(0);
    position: sticky;
    top: 0;
    height: 100vh;
  }

  .sidebar-toggle {
    display: none;
  }

  .gallery {
    flex-direction: row;
  }
}
</style>
