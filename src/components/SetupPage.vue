<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { verifyRepoOwnership } from '../composables/useAuth'
import { REPO_NAME, REPO_FULL_NAME } from '../config/repo'

const props = defineProps<{
  userName?: string
}>()

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'browse'): void
}>()

const authStore = useAuthStore()
const stepToken = ref('')
const submitting = ref(false)
const error = ref('')
const verified = ref(false)
const copied = ref(false)
const isRepoOwner = ref<boolean | null>(null)
const checkingRepo = ref(true)
const repoOwner = computed(() => authStore.user?.login || props.userName || 'zenHeart')
const userRepo = computed(() => `${repoOwner.value}/${REPO_NAME}`)

onMounted(async () => {
  const token = authStore.token || sessionStorage.getItem('mitosis_token') || ''
  const storedUser = sessionStorage.getItem('mitosis_user')
  const userLogin = authStore.user?.login || (storedUser ? JSON.parse(storedUser).login : '')

  if (token && userLogin) {
    try {
      const owned = await verifyRepoOwnership(token, userLogin)
      isRepoOwner.value = owned
    } catch {
      isRepoOwner.value = false
    }
  } else {
    isRepoOwner.value = false
  }
  checkingRepo.value = false
})

async function handleSubmit() {
  if (!stepToken.value.trim()) {
    error.value = '请输入 Step Token'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const res = await fetch('https://api.stepfun.com/v1/models', {
      headers: {
        Authorization: `Bearer ${stepToken.value}`,
      },
    })

    if (!res.ok) {
      throw new Error('Token 验证失败，请检查是否正确')
    }

    verified.value = true
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('mitosis_step_token', stepToken.value)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '验证失败'
  } finally {
    submitting.value = false
  }
}

function handleConfirm() {
  emit('complete')
}

async function copyToken() {
  if (!stepToken.value) return
  try {
    await navigator.clipboard.writeText(stepToken.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // clipboard API 不可用时降级为选中输入框
    error.value = '无法自动复制，请手动选中 Token 复制'
  }
}
</script>

<template>
  <div class="setup-page">
    <div class="setup-card">
      <h1>🧬 Mitosis</h1>
      <p class="greeting">你好，{{ userName || '用户' }}！</p>
      <p class="desc">欢迎来到 Mitosis。在开始创造之前，需要进行一些简单配置。</p>

      <div v-if="checkingRepo" class="status">检查仓库权限...</div>

      <div v-else-if="!isRepoOwner" class="non-owner-guide">
        <div class="info-banner">
          <span class="icon">ℹ️</span>
          <div>
            <h3>欢迎体验 Mitosis！</h3>
            <p>当前登录的 GitHub 账号 <strong>{{ userName || '用户' }}</strong> 还没有可用的 <code>{{ userRepo }}</code> 仓库。</p>
          </div>
        </div>

        <div class="guide-box">
          <h3>创建你自己的 Mitosis 仓库</h3>
          <p> Mitosis 是一个 AI 驱动的应用构建平台。要使用完整功能，你需要：</p>

          <div class="step">
            <span class="step-num">1</span>
            <div>
              <p>Fork 此仓库到你的 GitHub 账号：</p>
              <a
                :href="`https://github.com/${REPO_FULL_NAME}/fork`"
                target="_blank"
                rel="noopener"
                class="link"
              >
                github.com/{{ REPO_FULL_NAME }}/fork ↗
              </a>
            </div>
          </div>

          <div class="step">
            <span class="step-num">2</span>
            <div>
              <p>在你的 fork 中启用 GitHub Pages（Settings → Pages → Source: gh-pages branch）</p>
            </div>
          </div>

          <div class="step">
            <span class="step-num">3</span>
            <div>
              <p>配置 Cloudflare Worker（参考 <code>worker/</code> 目录）处理 OAuth 代理</p>
            </div>
          </div>

          <div class="step">
            <span class="step-num">4</span>
            <div>
              <p>在仓库 Secrets 中添加 StepFun API Token（名称: <code>STEP_TOKEN</code>）</p>
            </div>
          </div>
        </div>

        <p class="hint-text">
          或者，你可以继续浏览已部署的公开应用，无需配置。
        </p>
        <button @click="emit('browse')" class="btn-secondary">
          浏览公开应用 →
        </button>
      </div>

      <div v-else-if="!verified" class="form">
        <label class="label">StepFun API Token</label>
        <p class="hint">你的 Token 将用于驱动 AI Agent 构建应用。</p>
        <input
          v-model="stepToken"
          type="password"
          class="input"
          placeholder="输入你的 StepFun API Token..."
          :disabled="submitting"
          @keyup.enter="handleSubmit"
        />
        <p v-if="error" class="error">{{ error }}</p>
        <button
          @click="handleSubmit"
          class="btn-primary"
          :disabled="submitting || !stepToken.trim()"
        >
          {{ submitting ? '验证中...' : '验证 Token' }}
        </button>
      </div>

      <div v-else class="secrets-guide">
        <div class="success-banner">
          <span class="check">✅</span> Token 验证成功！
        </div>

        <div class="guide-box">
          <h3>最后一步：配置 GitHub Secrets</h3>
          <p>为了让 Agent Loop 能够使用你的 Token，需要手动添加一个 GitHub Secret：</p>

          <div class="step">
            <span class="step-num">1</span>
            <div>
              <p>进入你的仓库 Secrets 页面：</p>
              <a
                :href="`https://github.com/${userRepo}/settings/secrets`"
                target="_blank"
                rel="noopener"
                class="link"
              >
                github.com/{{ userRepo }}/settings/secrets ↗
              </a>
            </div>
          </div>

          <div class="step">
            <span class="step-num">2</span>
            <div>
              <p>点击 <strong>"New repository secret"</strong>，添加：</p>
              <div class="secret-item">
                <span class="secret-key">STEP_TOKEN</span>
                <button class="copy-btn" @click="copyToken" :title="copied ? '已复制到剪贴板' : '点击复制 Token'">
                  {{ copied ? '✅ 已复制' : '📋 复制 Token' }}
                </button>
              </div>
            </div>
          </div>

          <div class="step">
            <span class="step-num">3</span>
            <div>
              <p>添加完成后，点击下方按钮继续。</p>
            </div>
          </div>
        </div>

        <button @click="handleConfirm" class="btn-primary">
          我已添加 Secret，继续 →
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  padding: 1rem;
}

.setup-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2.5rem;
  max-width: 520px;
  width: 100%;
}

.status {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.non-owner-guide {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.info-banner {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem;
  background: rgba(0, 229, 255, 0.05);
  border: 1px solid rgba(0, 229, 255, 0.2);
  border-radius: 8px;
}

.info-banner .icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.info-banner h3 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.info-banner p {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

.info-banner strong {
  color: var(--accent);
}

.hint-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-align: center;
  margin: 0;
}

.btn-secondary {
  margin-top: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;
}

.btn-secondary:hover {
  background: rgba(0, 229, 255, 0.1);
}

h1 {
  font-size: 1.75rem;
  margin-bottom: 0.25rem;
}

.greeting {
  font-size: 1.1rem;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.desc {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 2rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.input {
  padding: 0.75rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--accent);
}

.input::placeholder {
  color: #555;
}

.btn-primary {
  margin-top: 1rem;
  padding: 0.75rem 1.5rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  transition: opacity 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  color: var(--error);
  font-size: 0.85rem;
}

.success-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(63, 185, 80, 0.1);
  border: 1px solid rgba(63, 185, 80, 0.3);
  border-radius: 8px;
  color: var(--success);
  font-weight: 500;
  margin-bottom: 1.5rem;
}

.secrets-guide {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.guide-box {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.25rem;
}

.guide-box h3 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
}

.guide-box p {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.step {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  align-items: flex-start;
}

.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
  margin-top: 2px;
}

.secret-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-primary);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  margin-top: 0.25rem;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.8rem;
}

.secret-key {
  color: var(--accent);
  font-weight: 600;
}

.secret-val {
  color: var(--text-secondary);
  word-break: break-all;
}

.link {
  color: var(--accent);
  font-size: 0.85rem;
}

.link:hover {
  text-decoration: underline;
}
</style>
