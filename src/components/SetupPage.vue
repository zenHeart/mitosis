<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  userName?: string
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const stepToken = ref('')
const submitting = ref(false)
const error = ref('')
const verified = ref(false)

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
      localStorage.setItem('mitosis_step_token', stepToken.value)
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
</script>

<template>
  <div class="setup-page">
    <div class="setup-card">
      <h1>🧬 Mitosis</h1>
      <p class="greeting">你好，{{ userName || '用户' }}！</p>
      <p class="desc">欢迎来到 Mitosis。在开始创造之前，需要进行一些简单配置。</p>

      <div v-if="!verified" class="form">
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
                :href="`https://github.com/zenHeart/mitosis/settings/secrets`"
                target="_blank"
                rel="noopener"
                class="link"
              >
                github.com/zenHeart/mitosis/settings/secrets ↗
              </a>
            </div>
          </div>

          <div class="step">
            <span class="step-num">2</span>
            <div>
              <p>点击 <strong>"New repository secret"</strong>，添加：</p>
              <div class="secret-item">
                <span class="secret-key">STEP_TOKEN</span>
                <span class="secret-val">{{ stepToken }}</span>
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
