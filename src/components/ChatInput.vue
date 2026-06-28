<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  isOwner: boolean
  thinking: boolean
  building: boolean
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
}>()

const inputText = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const sendTitle = computed(() => {
  if (!props.isOwner) return '仅仓库所有者可使用'
  if (props.thinking) return 'AI 思考中...'
  if (props.building) return '构建中，请稍候...'
  if (!props.modelValue.trim()) return '请输入内容'
  return '发送'
})

function handleSend() {
  if (!props.isOwner || props.thinking || props.building) return
  emit('send')
}
</script>

<template>
  <div class="input-area">
    <div v-if="isOwner" class="input-wrapper">
      <div class="cursor-glow"></div>
      <textarea
        v-model="inputText"
        class="chat-input"
        :placeholder="thinking ? 'AI 思考中...' : '描述你想构建的应用...'"
        :disabled="thinking || building"
        rows="1"
        aria-label="输入消息"
        @keydown.enter.exact.prevent="handleSend"
      />
      <button
        @click="handleSend"
        class="send-btn"
        :disabled="!inputText.trim() || thinking || building"
        :title="sendTitle"
      >
        <span v-if="thinking" class="spinner"></span>
        <span v-else>▲</span>
      </button>
    </div>
    <div v-else class="read-only-banner">
      🔒 仅仓库所有者可使用 AI 构建功能
    </div>
  </div>
</template>

<style scoped>
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
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--accent);
  border: none;
  color: #fff;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s, transform 0.1s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
  transform: translateY(-1px);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.read-only-banner {
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
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
</style>
