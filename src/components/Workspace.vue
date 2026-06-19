<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { usePolling } from '../composables/usePolling'
import { createIssue, getIssue, listApps } from '../composables/useGitHubAPI'
import AppCard from './AppCard.vue'
import type { BuildIssue, AppInfo } from '../types/app'

const authStore = useAuthStore()
const { start, stopAll } = usePolling()

const apps = ref<AppInfo[]>([])
const inputText = ref('')
const messages = ref<{ role: 'user' | 'system'; text: string; time: string }[]>([])
const building = ref(false)
const activeIssue = ref<BuildIssue | null>(null)

const repo = computed(() => `${authStore.user?.login || 'zenHeart'}/mitosis`)

onMounted(async () => {
  await loadApps()
})

async function loadApps() {
  if (!authStore.token) return
  try {
    apps.value = await listApps(authStore.token, repo.value)
  } catch (e) {
    console.error('Failed to load apps:', e)
  }
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || building.value || !authStore.token) return

  messages.value.push({ role: 'user', text, time: new Date().toLocaleTimeString() })
  inputText.value = ''
  building.value = true
  activeIssue.value = null

  try {
    const token = authStore.token!
    const appName = extractAppName(text)
    const title = `build: ${appName} v0`
    const body = text

    const issue = await createIssue(
      token,
      repo.value,
      title,
      body,
      [`app/${appName}`]
    )

    messages.value.push({
      role: 'system',
      text: `📝 已创建构建任务 #${issue.number}，正在排队...`,
      time: new Date().toLocaleTimeString(),
    })

    start(issue.number, () => getIssue(token, repo.value, issue.number), onIssueUpdate)
  } catch (e) {
    messages.value.push({
      role: 'system',
      text: `❌ 创建任务失败: ${e instanceof Error ? e.message : '未知错误'}`,
      time: new Date().toLocaleTimeString(),
    })
    building.value = false
  }
}

function onIssueUpdate(issue: BuildIssue) {
  activeIssue.value = issue

  if (issue.state === 'open') {
    messages.value.push({
      role: 'system',
      text: `🔨 正在构建中... (Issue #${issue.number})`,
      time: new Date().toLocaleTimeString(),
    })
  } else if (issue.state === 'closed') {
    const appName = extractAppName(issue.title)
    messages.value.push({
      role: 'system',
      text: `✅ ${appName} 构建完成！\n查看: https://mitosis.zenheart.site/apps/${appName}/`,
      time: new Date().toLocaleTimeString(),
    })
    building.value = false
    loadApps()
  }
}

function extractAppName(input: string): string {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9一-龥]/g, '-')
  const collapsed = cleaned.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return collapsed || 'my-app'
}

function handleNewChat() {
  stopAll()
  messages.value = []
  activeIssue.value = null
  building.value = false
}
</script>

<template>
  <div class="workspace">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>🧬 Mitosis</h2>
        <div class="user-info">
          <img v-if="authStore.user?.avatar_url" :src="authStore.user.avatar_url" class="avatar" />
          <span class="username">{{ authStore.user?.login }}</span>
          <button @click="authStore.logout" class="logout-btn" title="退出登录">⏻</button>
        </div>
      </div>
      <nav class="nav">
        <button @click="handleNewChat" class="new-chat-btn">+ 新建对话</button>
      </nav>
      <div class="apps-list">
        <h3>我的应用</h3>
        <div v-if="apps.length === 0" class="empty-apps">暂无应用</div>
        <AppCard v-for="app in apps" :key="app.id" :app="app" />
      </div>
    </aside>
    <main class="chat-area">
      <div class="messages">
        <div v-if="messages.length === 0" class="welcome">
          <h3>👋 你好，{{ authStore.user?.login }}</h3>
          <p>描述你想构建的应用，我来帮你实现。</p>
          <div class="examples">
            <button @click="inputText = '帮我做一个 todo 应用'">📝 Todo 应用</button>
            <button @click="inputText = '帮我做一个计算器'">🔢 计算器</button>
            <button @click="inputText = '帮我做一个 Markdown 编辑器'">📝 编辑器</button>
          </div>
        </div>
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['message', msg.role]"
        >
          <div class="message-content">{{ msg.text }}</div>
          <div class="message-time">{{ msg.time }}</div>
        </div>
        <div v-if="building" class="message system">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
      <div class="input-area">
        <div class="input-wrapper">
          <div class="cursor-glow"></div>
          <textarea
            v-model="inputText"
            class="chat-input"
            placeholder="描述你想构建的应用..."
            :disabled="building"
            rows="1"
            @keydown.enter.exact.prevent="handleSend"
          />
          <button
            @click="handleSend"
            class="send-btn"
            :disabled="!inputText.trim() || building"
            title="发送"
          >
            ▲
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h2 {
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.username {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  padding: 0.25rem;
  transition: color 0.2s;
}

.logout-btn:hover {
  color: var(--error);
}

.nav {
  padding: 0.75rem;
}

.new-chat-btn {
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent);
}

.apps-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.75rem;
}

.apps-list h3 {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  padding: 0 0.25rem;
}

.empty-apps {
  font-size: 0.8rem;
  color: #555;
  padding: 0.5rem;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.welcome {
  text-align: center;
  margin: auto;
  padding: 2rem;
}

.welcome h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.welcome p {
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.examples button {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: all 0.2s;
}

.examples button:hover {
  border-color: var(--accent);
  background: var(--bg-tertiary);
}

.message {
  max-width: 80%;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.message.user {
  align-self: flex-end;
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message.system {
  align-self: flex-start;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}

.message-content {
  margin-bottom: 0.25rem;
}

.message-time {
  font-size: 0.7rem;
  opacity: 0.6;
  text-align: right;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 0.5rem 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: bounce 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.input-area {
  padding: 1rem 1.5rem 1.5rem;
  background: var(--bg-primary);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: flex-end;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.5rem;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.cursor-glow {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 2px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent), 0 0 16px var(--accent-glow);
  opacity: 0;
  transition: opacity 0.3s;
}

.input-wrapper:focus-within .cursor-glow {
  opacity: 1;
}

.chat-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 0.95rem;
  padding: 0.5rem;
  resize: none;
  outline: none;
  max-height: 120px;
  line-height: 1.5;
}

.chat-input::placeholder {
  color: #555;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--accent);
  border: none;
  color: #fff;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
