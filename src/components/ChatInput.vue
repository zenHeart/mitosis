<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Image } from '@lucide/vue'

const props = defineProps<{
  isOwner: boolean
  thinking: boolean
  building: boolean
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'images', files: { dataUrl: string; name: string }[]): void
}>()

const inputText = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const images = ref<{ dataUrl: string; name: string }[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const imageError = ref('')

watch(inputText, () => {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  if (el.value) {
    el.style.height = el.scrollHeight + 'px'
  }
})

const sendTitle = computed(() => {
  if (!props.isOwner) return '仅仓库所有者可使用'
  if (props.thinking) return 'AI 思考中...'
  if (props.building) return '构建中，请稍候...'
  if (!props.modelValue.trim() && images.value.length === 0) return '请输入内容或添加图片'
  return '发送'
})

function handleSend() {
  if (!props.isOwner || props.thinking || props.building) return
  imageError.value = ''
  emit('images', images.value)
  emit('send')
  images.value = [] // 发送后清空图片
}

function triggerFileSelect() {
  fileInputRef.value?.click()
}

async function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files) return
  await addImageFiles(files)
  target.value = '' // reset so same file can be re-selected
}

async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      imageFiles.push(item.getAsFile()!)
    }
  }
  if (imageFiles.length > 0) {
    e.preventDefault()
    await addImageFiles(imageFiles)
  }
}

async function addImageFiles(files: FileList | File[]) {
  imageError.value = ''
  const MAX_IMAGES = 4
  const MAX_SIZE_MB = 2
  const oversized: string[] = []
  for (const file of Array.from(files)) {
    if (images.value.length >= MAX_IMAGES) break
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      oversized.push(file.name)
      continue
    }
    const dataUrl = await readFileAsDataURL(file)
    images.value.push({ dataUrl, name: file.name })
  }
  if (oversized.length > 0) {
    imageError.value = `图片 ${oversized.join('、')} 超过 ${MAX_SIZE_MB}MB 限制，请压缩后重试。`
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}
</script>

<template>
  <div class="input-area">
    <div v-if="isOwner" class="input-wrapper">
      <!-- 图片预览区 -->
      <div v-if="images.length" class="image-preview-bar">
        <div v-for="(img, i) in images" :key="i" class="image-preview-item">
          <img :src="img.dataUrl" :alt="img.name" class="preview-thumb" />
          <button class="remove-img-btn" @click="removeImage(i)" title="移除图片" aria-label="移除图片">✕</button>
        </div>
      </div>
      <div v-if="imageError" class="image-error">{{ imageError }}</div>
      <div class="cursor-glow"></div>
      <textarea
        ref="textareaEl"
        v-model="inputText"
        class="chat-input"
        :placeholder="thinking ? 'AI 思考中...' : '描述你想构建的应用...（可粘贴/选择图片）'"
        :disabled="thinking || building"
        rows="1"
        aria-label="输入消息"
        @keydown.enter.exact.prevent="handleSend"
        @paste="onPaste"
      />
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        class="hidden-file-input"
        @change="onFileSelected"
      />
      <div class="action-btns">
        <button
          @click="triggerFileSelect"
          class="attach-btn"
          :disabled="thinking || building || images.length >= 4"
          title="添加图片（最多4张，单张≤2MB）"
          aria-label="添加图片"
        >
          <Image :size="20" stroke-width="2" />
        </button>
        <button
          @click="handleSend"
          class="send-btn"
          :disabled="(!inputText.trim() && images.length === 0) || thinking || building"
          :title="sendTitle"
        >
          <span v-if="thinking" class="spinner"></span>
          <span v-else>▲</span>
        </button>
      </div>
    </div>
    <div v-else class="read-only-banner">
      🔒 仅仓库所有者可使用 AI 构建功能
    </div>
  </div>
</template>

<style scoped>
.input-area {
  padding: 0.75rem 1rem 1rem;
  background: var(--bg-primary);
}

.input-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
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

/* 图片预览区 */
.image-preview-bar {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0;
  flex-wrap: wrap;
}

.image-preview-item {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.preview-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-img-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.7rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  transition: background 0.15s;
}

.remove-img-btn:hover {
  background: rgba(255, 60, 60, 0.8);
}

.image-error {
  color: var(--error);
  font-size: 0.8rem;
  padding: 0.35rem 0.5rem 0;
  line-height: 1.4;
}

/* 输入行 */
.input-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
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
  color: var(--placeholder);
}

.action-btns {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding-bottom: 0.2rem;
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

.send-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hidden-file-input {
  display: none;
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
