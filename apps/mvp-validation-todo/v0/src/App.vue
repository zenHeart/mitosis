<template>
  <main class="todo-app">
    <h1 class="app-title">待办事项</h1>

    <div class="todo-input-group">
      <input
        v-model="newTodo"
        type="text"
        placeholder="添加新任务..."
        class="todo-input"
        @keydown.enter="addTodo"
      />
      <button class="btn btn-primary" @click="addTodo">添加</button>
    </div>

    <nav class="todo-filters" aria-label="筛选任务">
      <button
        v-for="f in filters"
        :key="f.value"
        class="filter-tab"
        :class="{ active: filter === f.value }"
        @click="filter = f.value"
      >
        {{ f.label }}
      </button>
    </nav>

    <ul v-if="filteredTodos.length" class="todo-list">
      <li v-for="todo in filteredTodos" :key="todo.id" class="todo-item" :class="{ completed: todo.completed }">
        <label class="todo-item-label">
          <input
            type="checkbox"
            :checked="todo.completed"
            class="todo-checkbox"
            @change="toggleTodo(todo.id)"
          />
          <span class="todo-text">{{ todo.text }}</span>
        </label>
        <button class="btn btn-danger" @click="deleteTodo(todo.id)" aria-label="删除任务">删除</button>
      </li>
    </ul>

    <p v-else class="empty-state">暂无任务</p>

    <p class="todo-count">共 {{ todos.length }} 项，{{ remaining }} 项未完成</p>

    <a class="mitosis-anchor" href="https://mitosis.zenheart.site?ref=mvp-validation-todo">在 Mitosis 中继续迭代</a>
  </main>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Todo {
  id: number
  text: string
  completed: boolean
}

const todos = ref<Todo[]>([])
const newTodo = ref('')
const filter = ref<'all' | 'active' | 'completed'>('all')

const filters = [
  { value: 'all' as const, label: '全部' },
  { value: 'active' as const, label: '进行中' },
  { value: 'completed' as const, label: '已完成' },
]

const filteredTodos = computed(() => {
  if (filter.value === 'active') return todos.value.filter(t => !t.completed)
  if (filter.value === 'completed') return todos.value.filter(t => t.completed)
  return todos.value
})

const remaining = computed(() => todos.value.filter(t => !t.completed).length)

let nextId = 1

function addTodo() {
  const text = newTodo.value.trim()
  if (!text) return
  todos.value.push({ id: nextId++, text, completed: false })
  newTodo.value = ''
}

function toggleTodo(id: number) {
  const todo = todos.value.find(t => t.id === id)
  if (todo) todo.completed = !todo.completed
}

function deleteTodo(id: number) {
  todos.value = todos.value.filter(t => t.id !== id)
}
</script>
