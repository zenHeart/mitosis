<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Image, Send, Menu, X, Gamepad, Calculator, FileText } from '@lucide/vue'

// ── Types ──────────────────────────────────────────────────────────────

interface Message {
  id: number
  role: 'user' | 'assistant' | 'system'
  text: string
  time: string
}

// ── State ───────────────────────────────────────────────────────────────

const sidebarOpen = ref(false)
const inputText = ref('')
const messages = ref<Message[]>([
  {
    id: 1,
    role: 'assistant',
    text: '👋 你好！我是 Mitosis 平台。描述你想构建的应用，我会帮你自动生成。',
    time: new Date().toLocaleTimeString(),
  },
])
const thinking = ref(false)
const isMobile = ref(false)

// ── Computed ────────────────────────────────────────────────────────────

const isSmallScreen = () => (window as any).innerWidth <= 640
const placeholderText = computed(() =>
  thinking.value ? 'AI 思考中...' : '描述你想构建的应用...（可粘贴/选择图片）'
)

// ── Lifecycle ───────────────────────────────────────────────────────────

onMounted(() => {
  isMobile.value = isSmallScreen()
  ;(window as any).addEventListener('resize', () => {
    isMobile.value = isSmallScreen()
  })
})

// ── Actions ─────────────────────────────────────────────────────────────

function handleSend() {
  if (!inputText.value.trim()) return
  const text = inputText.value.trim()
  const now = new Date().toLocaleTimeString()
  messages.value.push({ id: Date.now(), role: 'user', text, time: now })
  inputText.value = ''
  thinking.value = true

  setTimeout(() => {
    thinking.value = false
    const responses: Record<string, string> = {
      '俄罗斯方块': '好的，正在为你构建俄罗斯方块游戏...\n\n✅ 已创建 Issue #1\n🔨 正在生成代码...\n📦 构建中...\n✅ 验证通过！\n\n游戏已生成，包含完整的旋转、消行、计分和结束判定功能。',
      '贪吃蛇': '好的，正在为你构建贪吃蛇游戏...\n\n✅ 已创建 Issue #2\n🔨 正在生成代码...\n📦 构建中...\n✅ 验证通过！\n\n游戏已生成，包含完整的蛇移动、食物生成和碰撞检测功能。',
      'todo': '好的，正在为你构建 Todo 应用...\n\n✅ 已创建 Issue #3\n🔨 正在生成代码...\n📦 构建中...\n✅ 验证通过！\n\n应用已生成，支持添加、删除和标记完成 Todo 项目。',
      '计算器': '好的，正在为你构建计算器...\n\n✅ 已创建 Issue #4\n🔨 正在生成代码...\n📦 构建中...\n✅ 验证通过！\n\n应用已生成，支持加减乘除基础运算。',
    }
    let response = '收到！正在分析你的需求...\n\n我会自动判断是构建新应用还是修改现有平台。请稍候...'
    for (const [key, value] of Object.entries(responses)) {
      if (text.includes(key)) {
        response = value
        break
      }
    }
    messages.value.push({
      id: Date.now() + 1,
      role: 'assistant',
      text: response,
      time: new Date().toLocaleTimeString(),
    })
  }, 1500)
}

function setInput(text: string) {
  inputText.value = text
}

function openMitosis() {
  window.open('https://mitosis.zenheart.site?ref=mitosis-平台', '_blank')
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar overlay (mobile) -->
    <div
      v-if="sidebarOpen"
      class="sidebar-overlay"
      @click="sidebarOpen = false"
    />

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <div class="sidebar-header-left">
          <h2>🧬 Mitosis</h2>
          <button class="sidebar-close-mobile" @click="sidebarOpen = false" aria-label="关闭侧边栏">
            <X :size="20" stroke-width="2" />
          </button>
        </div>
        <p class="sidebar-subtitle">AI 应用构建平台</p>
      </div>

      <div class="sidebar-sections">
        <div class="sidebar-section">
          <h3 class="section-label">快速操作</h3>
          <div class="quick-actions">
            <button class="quick-action-btn" @click="setInput('帮我做一个俄罗斯方块游戏')">
              <Gamepad :size="16" stroke-width="2" />
              <span>俄罗斯方块</span>
            </button>
            <button class="quick-action-btn" @click="setInput('帮我做一个贪吃蛇游戏')">
              <Gamepad :size="16" stroke-width="2" />
              <span>贪吃蛇</span>
            </button>
            <button class="quick-action-btn" @click="setInput('帮我做一个 todo 应用')">
              <FileText :size="16" stroke-width="2" />
              <span>Todo 应用</span>
            </button>
            <button class="quick-action-btn" @click="setInput('帮我做一个计算器')">
              <Calculator :size="16" stroke-width="2" />
              <span>计算器</span>
            </button>
          </div>
        </div>
      </div>

      <div class="sidebar-footer">
        <button class="continue-btn" @click="openMitosis">
          🧬 在 Mitosis 中继续迭代
        </button>
        <p class="footer-hint">这是由 AI 构建的应用。登录后可以在此基础上继续迭代。</p>
      </div>
    </aside>

    <!-- Main chat area -->
    <main class="chat-area">
      <!-- Mobile sidebar toggle -->
      <button class="sidebar-toggle-mobile" @click="toggleSidebar" aria-label="打开菜单">
        <Menu :size="22" stroke-width="2" />
      </button>

      <div class="messages" role="log" aria-live="polite" aria-label="对话消息">
        <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
          <div class="message-content">{{ msg.text }}</div>
          <div class="message-time">{{ msg.time }}</div>
        </div>

        <!-- Thinking indicator -->
        <div v-if="thinking" class="message system">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <div class="input-area">
        <div class="input-wrapper">
          <textarea
            v-model="inputText"
            class="chat-input"
            :placeholder="placeholderText"
            :disabled="thinking"
            rows="1"
            aria-label="输入消息"
            @keydown.enter.exact.prevent="handleSend"
            @input="(e: Event) => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }"
          />
          <div class="action-btns">
            <button class="attach-btn" title="添加图片" aria-label="添加图片" disabled>
              <Image :size="20" stroke-width="2" />
            </button>
            <button
              @click="handleSend"
              class="send-btn"
              :disabled="!inputText.trim() || thinking"
              :title="thinking ? 'AI 思考中...' : '发送'"
            >
              <span v-if="thinking" class="spinner"></span>
              <Send v-else :size="18" stroke-width="2.5" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

/* ── Sidebar ──────────────────────────────────────────────────────────── */
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

.sidebar-header-left {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.sidebar-header h2 {
  font-size: 1.1rem;
  background: linear-gradient(135deg, #58a6ff, #00e5ff, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  background-size: 200% 200%;
  animation: brandShift 8s ease-in-out infinite;
}

@keyframes brandShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.sidebar-subtitle {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.3rem;
}

.sidebar-close-mobile {
  display: none;
  background: none;
  border: none;
  font-size: 1.25rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, background 0.2s;
}

.sidebar-close-mobile:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.sidebar-sections {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

.sidebar-section {
  margin-bottom: 1rem;
}

.section-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.35rem 0.5rem 0.1rem;
  letter-spacing: 0.03em;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.quick-action-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-align: left;
}

.quick-action-btn:hover {
  background: var(--bg-tertiary);
  border-color: var(--border);
}

.sidebar-footer {
  padding: 0.75rem;
  border-top: 1px solid var(--border);
}

.continue-btn {
  width: 100%;
  padding: 0.6rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}

.continue-btn:hover {
  opacity: 0.9;
}

.footer-hint {
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  text-align: center;
  line-height: 1.4;
}

/* ── Chat Area ────────────────────────────────────────────────────────── */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

.sidebar-toggle-mobile {
  display: none;
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 201;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(88, 166, 255, 0.04) 0%, transparent 60%),
    var(--bg-primary);
}

.message {
  max-width: 80%;
  padding: 0.75rem 1rem;
  border-radius: 14px;
  line-height: 1.6;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message.user {
  align-self: flex-end;
  background: var(--user-msg-bg);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message.assistant {
  align-self: flex-start;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 14px;
}

.message.system {
  align-self: flex-start;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--warning);
  border-bottom-left-radius: 4px;
  font-size: 0.88rem;
}

.message-content {
  margin-bottom: 0.25rem;
  overflow-wrap: break-word;
  word-break: break-word;
  white-space: pre-wrap;
}

.message-time {
  font-size: 0.7rem;
  opacity: 0.7;
  text-align: right;
}

.message.system .message-time {
  color: var(--text-secondary);
  opacity: 0.6;
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

/* ── Input Area ───────────────────────────────────────────────────────── */
.input-area {
  padding: 0.75rem 1rem 1rem;
  background: var(--bg-primary);
}

/* 移动端输入区优化 */
@media (max-width: 640px) {
  .input-area {
    padding: 0.5rem 0.6rem 0.6rem;
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
  }
}

.input-wrapper {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.6rem;
  gap: 0.4rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

@media (max-width: 640px) {
  .input-wrapper {
    padding: 0.45rem;
    border-radius: 12px;
    gap: 0.3rem;
  }
}

.input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.chat-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: max(16px, 0.95rem);
  padding: 0.5rem;
  resize: none;
  outline: none;
  max-height: 120px;
  line-height: 1.5;
  overflow-y: auto;
  min-height: 44px;
}

.chat-input::placeholder {
  color: var(--placeholder);
}

.action-btns {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding-bottom: 0.2rem;
}

@media (max-width: 640px) {
  .action-btns {
    gap: 0.3rem;
    padding-bottom: 0.1rem;
  }

  .attach-btn {
    width: 42px;
    height: 42px;
    border-radius: 9px;
  }

  .send-btn {
    width: 42px;
    height: 42px;
    border-radius: 10px;
  }
}

.attach-btn {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.attach-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.attach-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.attach-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--accent);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
  flex-shrink: 0;
  cursor: pointer;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.3);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.96);
  box-shadow: 0 1px 4px rgba(88, 166, 255, 0.2);
}

.send-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.send-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 触摸设备优化 */
@media (pointer: coarse) {
  .chat-input {
    font-size: 16px;
  }

  .input-wrapper {
    padding: 0.5rem;
  }
}

/* ── Mobile ───────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .workspace {
    flex-direction: column;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    max-width: 85vw;
    height: 100vh;
    height: 100dvh;
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
  }

  .sidebar-toggle-mobile {
    display: flex;
  }

  .sidebar-close-mobile {
    display: flex;
  }

  .chat-area {
    width: 100%;
  }

  .messages {
    padding: 1rem;
    padding-top: 3.5rem;
  }

  .message {
    max-width: 90%;
  }

  .session-open-btn,
  .app-nav-open-btn,
  .logout-btn {
    min-width: 44px;
    min-height: 44px;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
  }
}

@media (min-width: 641px) {
  .sidebar-toggle-mobile {
    display: none;
  }

  .sidebar-overlay {
    display: none;
  }
}

@media (pointer: coarse) {
  .session-item,
  .new-chat-btn,
  .logout-btn,
  .session-open-btn,
  .sidebar-close-mobile {
    min-height: 44px;
  }

  .sidebar-toggle-mobile {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
