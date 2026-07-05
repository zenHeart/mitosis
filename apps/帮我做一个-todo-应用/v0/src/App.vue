<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import './assets/main.css'

interface Todo {
  id: number
  text: string
  completed: boolean
}

const STORAGE_KEY = 'mitosis-todo-app-v0'

const todos = ref<Todo[]>([])
const newTodo = ref('')
const filter = ref<'all' | 'active' | 'completed'>('all')

function loadTodos(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        todos.value = parsed.filter(
          (item: unknown): item is Todo =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as Record<string, unknown>).id === 'number' &&
            typeof (item as Record<string, unknown>).text === 'string' &&
            typeof (item as Record<string, unknown>).completed === 'boolean'
        )
      }
    }
  } catch {
    // storage read failed, start with empty list
  }
}

function saveTodos(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos.value))
  } catch {
    // storage write failed silently
  }
}

function addTodo(): void {
  const text = newTodo.value.trim()
  if (!text) return
  todos.value.push({
    id: Date.now(),
    text,
    completed: false,
  })
  newTodo.value = ''
}

function toggleTodo(id: number): void {
  const todo = todos.value.find((t: Todo) => t.id === id)
  if (todo) {
    todo.completed = !todo.completed
  }
}

function removeTodo(id: number): void {
  todos.value = todos.value.filter((t: Todo) => t.id !== id)
}

function clearCompleted(): void {
  todos.value = todos.value.filter((t: Todo) => !t.completed)
}

const filteredTodos = computed<Todo[]>(() => {
  switch (filter.value) {
    case 'active':
      return todos.value.filter((t: Todo) => !t.completed)
    case 'completed':
      return todos.value.filter((t: Todo) => t.completed)
    default:
      return todos.value
  }
})

const activeCount = computed<number>(() =>
  todos.value.filter((t: Todo) => !t.completed).length
)

const hasCompleted = computed<boolean>(() =>
  todos.value.some((t: Todo) => t.completed)
)

function setFilter(f: 'all' | 'active' | 'completed'): void {
  filter.value = f
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    addTodo()
  }
}

watch(todos, saveTodos, { deep: true })

onMounted(() => {
  loadTodos()
})
</script>

<template>
  <div class="app">
    <div class="card">
      <header class="header">
        <h1 class="title">📝 Todo 应用</h1>
        <p class="subtitle">简单高效的任务管理工具</p>
      </header>

      <div class="input-group">
        <input
          v-model="newTodo"
          type="text"
          class="todo-input"
          placeholder="添加新的待办事项..."
          @keydown="handleKeydown"
        />
        <button class="btn-add" @click="addTodo">添加</button>
      </div>

      <div v-if="todos.length === 0" class="empty-state">
        <span class="empty-icon">📋</span>
        <p class="empty-text">还没有待办事项</p>
        <p class="empty-hint">在上方输入框中添加你的第一个任务吧！</p>
      </div>

      <ul v-else class="todo-list">
        <li
          v-for="todo in filteredTodos"
          :key="todo.id"
          class="todo-item"
          :class="{ completed: todo.completed }"
        >
          <label class="todo-label">
            <input
              type="checkbox"
              class="todo-checkbox"
              :checked="todo.completed"
              @change="toggleTodo(todo.id)"
            />
            <span class="todo-text">{{ todo.text }}</span>
          </label>
          <button
            class="btn-delete"
            @click="removeTodo(todo.id)"
            aria-label="删除"
          >
            ✕
          </button>
        </li>
      </ul>

      <footer v-if="todos.length > 0" class="footer">
        <span class="todo-count">{{ activeCount }} 项待完成</span>
        <div class="filter-tabs">
          <button
            v-for="f in ['all', 'active', 'completed']"
            :key="f"
            class="filter-tab"
            :class="{ active: filter === f }"
            @click="setFilter(f as 'all' | 'active' | 'completed')"
          >
            {{ f === 'all' ? '全部' : f === 'active' ? '进行中' : '已完成' }}
          </button>
        </div>
        <button
          v-if="hasCompleted"
          class="btn-clear"
          @click="clearCompleted"
        >
          清除已完成
        </button>
      </footer>
    </div>

    <div class="mitosis-link">
      <p>这是由 AI 构建的应用。登录后可以在此基础上继续迭代。</p>
      <a
        href="https://mitosis.zenheart.site?ref=%E5%B8%AE%E6%88%91%E5%81%9A%E4%B8%80%E4%B8%AA-todo-%E5%BA%94%E7%94%A8"
        target="_blank"
        rel="noopener noreferrer"
        class="mitosis-btn"
      >
        🧬 在 Mitosis 中继续迭代
      </a>
    </div>
  </div>
</template>
