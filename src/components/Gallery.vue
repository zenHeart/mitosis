<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import type { AppInfo, ChatSession } from '../types/app'
import { useAuthStore } from '../stores/auth'
import { useSessionStore } from '../stores/session'
import { getLoginUrl } from '../composables/useAuth'
import { REPO_FULL_NAME } from '../config/repo'
import { listApps } from '../composables/useGitHubAPI'
import { Wrench, Smartphone, FileText, PanelLeft, Sun, Moon, Package, Gamepad, AlertTriangle } from '@lucide/vue'
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
const error = ref('') // OAuth 错误等
const apiError = ref('') // 应用列表 API 错误（不掩盖 fallback）
const retryLoading = ref(false)
let loadTimer: ReturnType<typeof setTimeout> | null = null
const selectedApp = ref<string | undefined>(props.initialApp)
const selectedSession = ref<number | undefined>(props.initialApp ? undefined : undefined)
const selectedCardRef = ref<HTMLElement | null>(null)
const appsGridRef = ref<HTMLElement | null>(null)
const sidebarOpen = ref(false)
const loginLoading = ref(false)

const sessionGroups = computed(() => {
  const raw = sessionStore.groupedSessions as { platform: ChatSession[]; app: ChatSession[]; other: ChatSession[] }
  return [
    { key: 'platform', label: '平台', icon: Wrench, sessions: raw.platform },
    { key: 'app', label: '应用', icon: Smartphone, sessions: raw.app },
    { key: 'other', label: '其他', icon: FileText, sessions: raw.other },
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

async function loadApps() {
  loading.value = true
  apiError.value = ''
  retryLoading.value = false
  if (loadTimer) clearTimeout(loadTimer)
  loadTimer = setTimeout(() => {
    if (loading.value) retryLoading.value = true
  }, 8000)

  try {
    const apiApps = await listApps(authStore.token || '', REPO_FULL_NAME)
    apps.value = apiApps.length > 0 ? apiApps : LOCAL_APPS
  } catch (e) {
    apps.value = LOCAL_APPS
    // 不掩盖 fallback：保留 API 错误信息，让用户知道正在使用本地数据
    apiError.value = e instanceof Error ? e.message : '加载应用列表失败，显示本地示例'
  } finally {
    loading.value = false
    if (loadTimer) clearTimeout(loadTimer)
  }
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

  // 显示 OAuth 错误（如果有）
  if (authStore.oauthError) {
    error.value = authStore.oauthError
    authStore.oauthError = null
  }

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

  // 加载应用列表（带 8s 慢加载提示）
  await loadApps()
})

// 监听 OAuth 错误（处理 authStore.init() 在组件挂载后才完成的情况）
watch(
  () => authStore.oauthError,
  (newError) => {
    if (newError) {
      error.value = newError
      authStore.oauthError = null
    }
  }
)
</script>

<template>
  <div class="gallery">
    <!-- 会话侧边栏（登录后可见）────────────────────────────── -->
    <aside v-if="isLoggedIn" class="session-sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <h3>会话</h3>
        <button class="sidebar-close" @click="sidebarOpen = false" aria-label="关闭侧边栏">
          <X :size="18" stroke-width="2" />
        </button>
      </div>
      <div class="sidebar-sessions">
        <div
          v-for="group in sessionGroups"
          :key="group.key"
          class="session-group"
        >
          <div class="group-label">
            <component :is="group.icon" :size="14" stroke-width="2" />
            {{ group.label }}
          </div>
          <button
            v-for="session in group.sessions"
            :key="session.issueNumber"
            type="button"
            :class="['session-item', { active: selectedSession === session.issueNumber }]"
            @click="selectSession(session.issueNumber)"
          >
            <span class="session-title">{{ session.title }}</span>
            <span class="session-status" :class="session.status">{{ session.status }}</span>
          </button>
        </div>
      </div>
    </aside>

    <header class="gallery-header">
      <div class="brand">
        <button v-if="isLoggedIn" class="sidebar-toggle" @click="sidebarOpen = !sidebarOpen" aria-label="打开会话侧边栏">
          <PanelLeft :size="22" stroke-width="2" />
        </button>
        <div class="brand-center">
          <Dna :size="28" stroke-width="2" class="logo-icon" />
          <h1>Mitosis</h1>
        </div>
        <button class="theme-toggle" @click="toggleDarkMode" :aria-label="darkMode === 'dark' ? '切换到亮色模式' : '切换到暗黑模式'">
          <Sun v-if="darkMode === 'dark'" :size="20" stroke-width="2" />
          <Moon v-else :size="20" stroke-width="2" />
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
        <!-- 加载骨架屏（1.5s shimmer 动画） -->
        <div v-if="loading" class="apps-grid apps-grid--skeleton">
          <div v-for="i in 2" :key="'sk-'+i" class="skeleton-card">
            <div class="skeleton-icon"></div>
            <div class="skeleton-lines">
              <div class="skeleton-line skeleton-line--title"></div>
              <div class="skeleton-line skeleton-line--version"></div>
            </div>
          </div>
          <div v-if="retryLoading" class="skeleton-retry">
            <button @click="loadApps" class="retry-link">加载较慢，点击重试</button>
          </div>
        </div>

        <!-- API 错误提示（不掩盖 fallback 数据） -->
        <div v-if="apiError" class="api-error-banner">
          <AlertTriangle :size="18" stroke-width="2" class="api-error-icon" />
          <span class="api-error-text">{{ apiError }}</span>
          <button @click="loadApps" class="retry-link">重试</button>
        </div>

        <!-- 空状态 -->
        <div v-else-if="apps.length === 0" class="status empty">
          <Package :size="32" stroke-width="1.5" class="empty-icon" />
          <p>暂无应用</p>
          <p class="empty-hint">登录后可以开始构建自己的应用。</p>
        </div>

        <!-- 应用列表（API 数据或 LOCAL_APPS fallback） -->
        <div v-else class="apps-grid" ref="appsGridRef">
          <button
            v-for="app in apps"
            :key="app.id"
            :ref="(el) => setSelectedCard(selectedApp === app.id ? el as HTMLElement : null)"
            :class="['app-item', { selected: selectedApp === app.id }]"
            type="button"
            @click="openApp(app)"
          >
            <Package :size="24" stroke-width="2" class="app-icon-svg" />
            <div class="app-details">
              <span class="app-name">{{ app.name }}</span>
              <span class="app-version">v{{ app.latestVersion }}</span>
            </div>
            <span class="app-action">打开 →</span>
          </button>
        </div>
      </section>

      <section class="cta-section">
        <p v-if="isLoggedIn">想构建自己的应用？进入 Workspace 开始。</p>
        <p v-else>想构建自己的应用？仅仓库所有者登录后可使用 AI 构建。</p>
        <div class="cta-buttons">
          <button @click="scrollToApps" class="cta-btn cta-browse">
            <Gamepad :size="18" stroke-width="2" /> 浏览应用
          </button>
          <button
            v-if="!isLoggedIn"
            @click="handleLogin"
            class="cta-btn cta-login"
            :disabled="loginLoading"
          >
            {{ loginLoading ? '跳转中...' : '使用 GitHub 登录后创建自己的应用' }}
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
  position: relative;
  text-align: center;
  padding: 1.5rem 1rem 1rem;
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0 0.5rem;
}

.brand-center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.logo-icon {
  width: 24px;
  height: 24px;
  color: var(--accent);
  flex-shrink: 0;
}

.brand h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.tagline {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: var(--leading-normal);
}

.gallery-main {
  flex: 1;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem 1.25rem;
}

@media (min-width: 1024px) {
  .gallery-main {
    max-width: 960px;
    padding: 2rem;
  }

  .brand {
    justify-content: space-between;
    max-width: 960px;
    margin-left: auto;
    margin-right: auto;
    width: 100%;
  }

  .brand-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }
}

.hero {
  text-align: center;
  margin-bottom: 1.25rem;
}

.hero h2 {
  font-size: 1.375rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.hero p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: var(--leading-normal);
}

.apps-section {
  margin-bottom: 1.25rem;
}

.status {
  text-align: center;
  padding: 1.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: var(--leading-normal);
}

.status.error {
  color: var(--error);
}

.status.empty {
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.6;
  margin-bottom: 0.25rem;
}

.empty-hint {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* ── Skeleton loading ─────────────────────────────────────── */
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.apps-grid--skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.skeleton-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.skeleton-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  flex-shrink: 0;
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--border) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.skeleton-line {
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--border) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
}

.skeleton-line--title {
  width: 70%;
}

.skeleton-line--version {
  width: 35%;
  height: 10px;
}

.skeleton-retry {
  grid-column: 1 / -1;
  text-align: center;
  padding: 0.75rem;
}

.retry-link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.85rem;
  text-decoration: underline;
  padding: 0.25rem 0.5rem;
}

.api-error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: var(--warning-tint);
  border: 1px solid var(--warning-border);
  border-radius: 8px;
  color: var(--warning);
  font-size: 0.9rem;
}

.api-error-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
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
  transition: border-color 0.2s, background 0.2s, transform 0.2s;
  font: inherit;
  text-align: left;
  line-height: inherit;
  color: inherit;
}

.app-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-icon-svg {
  width: 24px;
  height: 24px;
  color: var(--text-secondary);
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
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-height: 1.3;
  word-break: break-word;
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
  padding: 1.5rem 1rem;
  border-top: 1px solid var(--border);
}

.cta-section p {
  color: var(--text-secondary);
  margin-bottom: 1rem;
  font-size: 0.9rem;
  line-height: var(--leading-normal);
}

.cta-buttons {
  display: flex;
  gap: 0.75rem;
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

.cta-login:hover:not(:disabled) {
  opacity: 0.9;
}

.cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9rem;
  transition: transform 0.2s, border-color 0.2s, background 0.2s;
  cursor: pointer;
  border: none;
  min-height: 44px;
}

.cta-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.gallery-footer {
  text-align: center;
  padding: 1.25rem 1rem;
  border-top: 1px solid var(--border);
  color: var(--text-tertiary);
  font-size: 0.8rem;
  line-height: var(--leading-normal);
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
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
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
  background: var(--text-tertiary);
  color: #fff;
}

.sidebar-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.4rem;
  margin-right: 0.5rem;
  transition: border-color 0.15s, color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
}

.sidebar-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.theme-toggle {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.4rem;
  margin-left: 0.5rem;
  transition: border-color 0.15s, color 0.15s, transform 0.15s;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
}

.theme-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
  transform: scale(1.1);
}

/* ── 移动端适配 ─────────────────────────────────────────── */
@media (max-width: 640px) {
  .gallery-header {
    padding: 0.75rem 1rem 0.5rem;
  }

  .brand {
    gap: 0.25rem;
  }

  .brand h1 {
    font-size: 1.5rem;
  }

  .logo-icon {
    width: 22px;
    height: 22px;
    color: var(--accent);
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

  .apps-grid,
  .apps-grid--skeleton {
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
  .brand {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    max-width: 960px;
    margin: 0 auto;
    width: 100%;
    gap: 0;
  }

  .sidebar-toggle {
    grid-column: 1;
    justify-self: start;
  }

  .brand-center {
    grid-column: 2;
    position: static;
    transform: none;
  }

  .theme-toggle {
    grid-column: 3;
    justify-self: end;
    margin-left: 0;
  }

  .gallery-main {
    max-width: 960px;
    padding: 2rem;
  }

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
