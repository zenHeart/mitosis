<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

interface Todo {
  id: number
  text: string
  completed: boolean
  createdAt: number
}

type FilterType = 'all' | 'active' | 'completed'

const STORAGE_KEY = 'todo-app-v0-data'

const todos = ref<Todo[]>([])
const newTodoText = ref<string>('')
const currentFilter = ref<FilterType>('all')
let nextId = 1

function loadTodos(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Todo[]
      if (Array.isArray(parsed)) {
        todos.value = parsed
        const maxId = parsed.reduce((max, t) => Math.max(max, t.id), 0)
        nextId = maxId + 1
      }
    }
  } catch {
    // corrupted data — start fresh
    todos.value = []
  }
}

function saveTodos(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos.value))
  } catch {
    // storage full or unavailable — fail silently
  }
}

watch(todos, saveTodos, { deep: true })

const filteredTodos = computed<Todo[]>(() => {
  switch (currentFilter.value) {
    case 'active':
      return todos.value.filter(t => !t.completed)
    case 'completed':
      return todos.value.filter(t => t.completed)
    default:
      return todos.value
  }
})

const activeCount = computed<number>(() =>
  todos.value.filter(t => !t.completed).length
)

const allCompleted = computed<boolean>(() =>
  todos.value.length > 0 && todos.value.every(t => t.completed)
)

const hasTodos = computed<boolean>(() => todos.value.length > 0)

function addTodo(): void {
  const text = newTodoText.value.trim()
  if (!text) return
  todos.value.push({
    id: nextId++,
    text,
    completed: false,
    createdAt: Date.now(),
  })
  newTodoText.value = ''
}

function toggleTodo(id: number): void {
  const todo = todos.value.find(t => t.id === id)
  if (todo) {
    todo.completed = !todo.completed
  }
}

function deleteTodo(id: number): void {
  todos.value = todos.value.filter(t => t.id !== id)
}

function clearCompleted(): void {
  todos.value = todos.value.filter(t => !t.completed)
}

function toggleAll(): void {
  const newState = !allCompleted.value
  todos.value.forEach(t => { t.completed = newState })
}

function setFilter(f: FilterType): void {
  currentFilter.value = f
}

onMounted(() => {
  loadTodos()
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1 class="app-title">📝 Todo 应用</h1>
      <p class="app-subtitle">高效管理你的每一天</p>
    </header>

    <main class="app-main">
      <!-- Input area -->
      <div class="input-row">
        <button
          class="toggle-all-btn"
          :class="{ checked: allCompleted }"
          @click="toggleAll"
          :disabled="!hasTodos"
          aria-label="全部完成"
        >
          ✓
        </button>
        <input
          v-model="newTodoText"
          class="todo-input"
          type="text"
          placeholder="添加新任务…"
          maxlength="200"
          @keydown.enter="addTodo"
        />
        <button
          class="add-btn"
          @click="addTodo"
          :disabled="!newTodoText.trim()"
        >
          添加
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="!hasTodos" class="empty-state">
        <span class="empty-icon">📋</span>
        <p class="empty-text">还没有任务</p>
        <p class="empty-hint">在上方输入框中添加你的第一个任务吧！</p>
      </div>

      <!-- Todo list -->
      <div v-else class="todo-list">
        <TransitionGroup name="todo">
          <div
            v-for="todo in filteredTodos"
            :key="todo.id"
            class="todo-item"
            :class="{ completed: todo.completed }"
          >
            <button
              class="check-btn"
              :class="{ checked: todo.completed }"
              @click="toggleTodo(todo.id)"
              :aria-label="todo.completed ? '标记为未完成' : '标记为已完成'"
            >
              <svg v-if="todo.completed" class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <span class="todo-text">{{ todo.text }}</span>
            <button
              class="delete-btn"
              @click="deleteTodo(todo.id)"
              aria-label="删除任务"
            >
              ✕
            </button>
          </div>
        </TransitionGroup>
      </div>

      <!-- Footer -->
      <div v-if="hasTodos" class="app-footer">
        <div class="footer-left">
          <span class="count">{{ activeCount }}</span>
          <span class="count-label">{{ activeCount === 1 ? '项待办' : '项待办' }}</span>
        </div>

        <div class="filter-tabs">
          <button
            class="filter-btn"
            :class="{ active: currentFilter === 'all' }"
            @click="setFilter('all')"
          >
            全部
          </button>
          <button
            class="filter-btn"
            :class="{ active: currentFilter === 'active' }"
            @click="setFilter('active')"
          >
            进行中
          </button>
          <button
            class="filter-btn"
            :class="{ active: currentFilter === 'completed' }"
            @click="setFilter('completed')"
          >
            已完成
          </button>
        </div>

        <button
          v-if="todos.some(t => t.completed)"
          class="clear-btn"
          @click="clearCompleted"
        >
          清除已完成
        </button>
      </div>
    </main>

    <!-- Mitosis iteration link -->
    <footer class="mitosis-link">
      <a
        href="https://mitosis.zenheart.site?ref=帮我做一个-todo-应用"
        target="_blank"
        rel="noopener noreferrer"
      >
        🧬 在 Mitosis 中继续迭代
      </a>
      <p class="mitosis-hint">这是由 AI 构建的应用。登录后可以在此基础上继续迭代。</p>
    </footer>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.app-container {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}

/* ── Header ── */
.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

.app-title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.25rem;
}

.app-subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

/* ── Input ── */
.input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem;
}

.toggle-all-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 2px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  transition: all var(--transition);
}
.toggle-all-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.toggle-all-btn.checked {
  background: var(--accent);
  border-color: var(--accent);
  color: #0f172a;
}
.toggle-all-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.todo-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 1rem;
  padding: 0.75rem 0.5rem;
  outline: none;
}
.todo-input::placeholder {
  color: var(--text-muted);
}

.add-btn {
  flex-shrink: 0;
  height: 44px;
  padding: 0 1.25rem;
  background: var(--accent);
  color: #0f172a;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
}
.add-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}
.add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Empty state ── */
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  background: var(--bg-card);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 0.75rem;
  opacity: 0.7;
}

.empty-text {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.empty-hint {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* ── Todo list ── */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  transition: all var(--transition);
}

.todo-item:hover {
  border-color: var(--bg-hover);
}

.todo-item.completed .todo-text {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* ── Check button ── */
.check-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 2px solid var(--border);
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition);
  padding: 0;
}
.check-btn:hover {
  border-color: var(--accent);
}
.check-btn.checked {
  background: var(--success);
  border-color: var(--success);
}
.check-icon {
  width: 14px;
  height: 14px;
  color: #0f172a;
}

/* ── Todo text ── */
.todo-text {
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  word-break: break-word;
  transition: color var(--transition);
}

/* ── Delete button ── */
.delete-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  border-radius: 6px;
  transition: all var(--transition);
}
.delete-btn:hover {
  background: rgba(248, 113, 113, 0.15);
  color: var(--danger);
}

/* ── Footer ── */
.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.85rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.count {
  font-weight: 700;
  color: var(--accent);
}

.filter-tabs {
  display: flex;
  gap: 0.25rem;
}

.filter-btn {
  padding: 0.35rem 0.75rem;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--transition);
}
.filter-btn:hover {
  color: var(--text-primary);
  background: var(--bg-input);
}
.filter-btn.active {
  color: var(--accent);
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
  font-weight: 600;
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: all var(--transition);
}
.clear-btn:hover {
  color: var(--danger);
  background: rgba(248, 113, 113, 0.1);
}

/* ── Mitosis link ── */
.mitosis-link {
  margin-top: 2rem;
  text-align: center;
  padding-bottom: 2rem;
}

.mitosis-link a {
  display: inline-block;
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 8px;
  transition: all var(--transition);
}
.mitosis-link a:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: var(--accent);
}

.mitosis-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

/* ── Transitions ── */
.todo-enter-active {
  transition: all 0.3s ease;
}
.todo-leave-active {
  transition: all 0.2s ease;
}
.todo-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.todo-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.todo-move {
  transition: transform 0.3s ease;
}
</style>
