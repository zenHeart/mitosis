<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import './assets/main.css'

// ── Types ──────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low'
type FilterType = 'all' | 'active' | 'completed'
type TaskStatus = 'active' | 'completed'

interface Task {
  id: number
  text: string
  priority: Priority
  status: TaskStatus
  createdAt: number
}

// ── Constants ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'create-tasks-v0'
const HIGH_PRIORITY_ORDER = 0
const MEDIUM_PRIORITY_ORDER = 1
const LOW_PRIORITY_ORDER = 2

const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

// ── State ───────────────────────────────────────────────────────────────

const tasks = ref<Task[]>([])
const newTaskText = ref('')
const newTaskPriority = ref<Priority>('medium')
const currentFilter = ref<FilterType>('all')
const editingId = ref<number | null>(null)
const editText = ref('')
let nextId = 1

// ── Computed ────────────────────────────────────────────────────────────

const totalTasks = computed(() => tasks.value.length)

const completedCount = computed(() =>
  tasks.value.filter((t) => t.status === 'completed').length,
)

const activeCount = computed(() =>
  tasks.value.filter((t) => t.status === 'active').length,
)

const completionRate = computed(() => {
  if (totalTasks.value === 0) return 0
  return Math.round((completedCount.value / totalTasks.value) * 100)
})

const filteredTasks = computed(() => {
  switch (currentFilter.value) {
    case 'active':
      return tasks.value
        .filter((t) => t.status === 'active')
        .sort((a, b) => {
          const orderMap: Record<Priority, number> = {
            high: HIGH_PRIORITY_ORDER,
            medium: MEDIUM_PRIORITY_ORDER,
            low: LOW_PRIORITY_ORDER,
          }
          return orderMap[a.priority] - orderMap[b.priority]
        })
    case 'completed':
      return tasks.value
        .filter((t) => t.status === 'completed')
        .sort((a, b) => b.createdAt - a.createdAt)
    default:
      return [...tasks.value].sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'active' ? -1 : 1
        }
        const orderMap: Record<Priority, number> = {
          high: HIGH_PRIORITY_ORDER,
          medium: MEDIUM_PRIORITY_ORDER,
          low: LOW_PRIORITY_ORDER,
        }
        return orderMap[a.priority] - orderMap[b.priority]
      })
  }
})

const hasCompletedTasks = computed(() =>
  tasks.value.some((t) => t.status === 'completed'),
)

const filterCounts = computed(() => ({
  all: totalTasks.value,
  active: activeCount.value,
  completed: completedCount.value,
}))

const inputError = computed(() => {
  const trimmed = newTaskText.value.trim()
  if (trimmed.length === 0) return '请输入任务内容'
  if (trimmed.length > 200) return '任务内容不能超过 200 个字符'
  return ''
})

// ── Helpers ─────────────────────────────────────────────────────────────

function loadTasks(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Task[]
      tasks.value = parsed
      if (parsed.length > 0) {
        nextId = Math.max(...parsed.map((t) => t.id)) + 1
      }
    }
  } catch {
    tasks.value = []
    nextId = 1
  }
}

function saveTasks(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.value))
  } catch {
    // storage quota exceeded or unavailable — non-critical
  }
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}

function getPriorityClass(priority: Priority): string {
  return priority
}

// ── Actions ─────────────────────────────────────────────────────────────

function addTask(): void {
  const trimmed = newTaskText.value.trim()
  if (!trimmed || trimmed.length > 200) return

  const task: Task = {
    id: nextId,
    text: trimmed,
    priority: newTaskPriority.value,
    status: 'active',
    createdAt: Date.now(),
  }

  tasks.value.unshift(task)
  nextId++
  newTaskText.value = ''
  newTaskPriority.value = 'medium'
  saveTasks()
}

function toggleTask(id: number): void {
  const task = tasks.value.find((t) => t.id === id)
  if (!task) return

  task.status = task.status === 'active' ? 'completed' : 'active'
  saveTasks()
}

function startEdit(id: number): void {
  const task = tasks.value.find((t) => t.id === id)
  if (!task || task.status === 'completed') return
  editingId.value = id
  editText.value = task.text
}

function confirmEdit(): void {
  if (editingId.value === null) return

  const trimmed = editText.value.trim()
  if (!trimmed || trimmed.length > 200) {
    cancelEdit()
    return
  }

  const task = tasks.value.find((t) => t.id === editingId.value)
  if (task) {
    task.text = trimmed
    saveTasks()
  }
  editingId.value = null
  editText.value = ''
}

function cancelEdit(): void {
  editingId.value = null
  editText.value = ''
}

function deleteTask(id: number): void {
  tasks.value = tasks.value.filter((t) => t.id !== id)
  if (editingId.value === id) {
    cancelEdit()
  }
  saveTasks()
}

function clearCompleted(): void {
  tasks.value = tasks.value.filter((t) => t.status === 'active')
  saveTasks()
}

function setFilter(filter: FilterType): void {
  currentFilter.value = filter
}

function handleEditKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmEdit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  }
}

function handleAddKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTask()
  }
}

// ── Persistence ─────────────────────────────────────────────────────────

watch(tasks, () => {
  saveTasks()
}, { deep: true })

// ── Lifecycle ───────────────────────────────────────────────────────────

onMounted(() => {
  loadTasks()
})
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <h1>📋 Create</h1>
      <p>轻量任务管理工具</p>
    </header>

    <!-- Stats -->
    <div class="stats-bar">
      <div class="stat-card">
        <div class="label">全部任务</div>
        <div class="value">{{ totalTasks }}</div>
      </div>
      <div class="stat-card">
        <div class="label">进行中</div>
        <div class="value">{{ activeCount }}</div>
      </div>
      <div class="stat-card">
        <div class="label">已完成</div>
        <div class="value">{{ completedCount }}</div>
      </div>
      <div class="stat-card">
        <div class="label">完成率</div>
        <div class="value">{{ completionRate }}%</div>
      </div>
    </div>

    <!-- Input -->
    <div class="input-section">
      <div class="task-input-row">
        <input
          v-model="newTaskText"
          class="task-input"
          type="text"
          placeholder="添加新任务..."
          maxlength="200"
          @keydown="handleAddKeydown"
        />
        <select
          v-model="newTaskPriority"
          class="priority-select"
        >
          <option value="high">🔴 高优先</option>
          <option value="medium">🟡 中优先</option>
          <option value="low">🟢 低优先</option>
        </select>
        <button
          class="add-btn"
          :disabled="!!inputError"
          @click="addTask"
        >
          添加
        </button>
      </div>
      <div class="error-msg">{{ inputError }}</div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs">
      <button
        v-for="filter in ['all', 'active', 'completed'] as FilterType[]"
        :key="filter"
        class="filter-tab"
        :class="{ active: currentFilter === filter }"
        @click="setFilter(filter)"
      >
        {{ filter === 'all' ? '全部' : filter === 'active' ? '进行中' : '已完成' }}
        <span class="count">{{ filterCounts[filter] }}</span>
      </button>
    </div>

    <!-- Task List -->
    <div v-if="filteredTasks.length > 0" class="task-list">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="task-item"
        :class="{ completed: task.status === 'completed' }"
      >
        <!-- Checkbox -->
        <button
          class="task-checkbox"
          :class="{ checked: task.status === 'completed' }"
          @click="toggleTask(task.id)"
          :aria-label="task.status === 'completed' ? '标记为未完成' : '标记为已完成'"
        >
          ✓
        </button>

        <!-- Content -->
        <div v-if="editingId !== task.id" class="task-content">
          <div class="task-text">{{ task.text }}</div>
          <div class="task-meta">
            <span class="task-priority" :class="getPriorityClass(task.priority)">
              {{ PRIORITY_LABELS[task.priority] }}
            </span>
            <span class="task-date">{{ formatDate(task.createdAt) }}</span>
          </div>
        </div>

        <!-- Edit Input -->
        <div v-else class="task-content">
          <input
            v-model="editText"
            class="task-edit-input"
            type="text"
            maxlength="200"
            @keydown="handleEditKeydown"
            @blur="confirmEdit"
          />
        </div>

        <!-- Actions -->
        <div v-if="task.status !== 'completed'" class="task-actions">
          <button
            v-if="editingId !== task.id"
            class="action-btn"
            @click="startEdit(task.id)"
            aria-label="编辑任务"
            title="编辑"
          >
            ✎
          </button>
          <button
            class="action-btn delete"
            @click="deleteTask(task.id)"
            aria-label="删除任务"
            title="删除"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <div class="icon">{{ currentFilter === 'completed' ? '🏆' : currentFilter === 'active' ? '✨' : '📝' }}</div>
      <h3>{{ currentFilter === 'completed' ? '还没有已完成的任务' : currentFilter === 'active' ? '所有任务已完成！' : '暂无任务' }}</h3>
      <p>{{ currentFilter === 'completed' ? '完成一些任务后会在这里显示' : currentFilter === 'active' ? '太棒了，继续保持！' : '添加你的第一个任务开始吧' }}</p>
    </div>

    <!-- Clear Completed -->
    <div v-if="hasCompletedTasks" class="clear-section">
      <button class="clear-btn" @click="clearCompleted">
        清除已完成任务 ({{ completedCount }})
      </button>
    </div>

    <!-- Continue in Mitosis -->
    <div class="continue-section">
      <a
        href="https://mitosis.zenheart.site?ref=create"
        target="_blank"
        rel="noopener noreferrer"
        class="continue-btn"
      >
        🧬 在 Mitosis 中继续迭代
      </a>
      <p class="continue-desc">这是由 AI 构建的应用。登录后可以在此基础上继续迭代。</p>
    </div>
  </div>
</template>