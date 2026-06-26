<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import './assets/main.css'

// ── Types ──────────────────────────────────────────────────────────────

type Direction = 'up' | 'down' | 'left' | 'right'
type GamePhase = 'start' | 'playing' | 'paused' | 'gameover'

interface Position {
  x: number
  y: number
}

// ── Constants ───────────────────────────────────────────────────────────

const COLS = 20
const ROWS = 20
const INITIAL_SPEED = 150
const SPEED_INCREMENT = 5
const MIN_SPEED = 60

// ── State ───────────────────────────────────────────────────────────────

const phase = ref<GamePhase>('start')
const snake = ref<Position[]>([{ x: 10, y: 10 }])
const direction = ref<Direction>('right')
const nextDirection = ref<Direction>('right')
const food = ref<Position>({ x: 15, y: 10 })
const score = ref(0)
const highScore = ref(0)
const speed = ref(INITIAL_SPEED)

let gameTimer: ReturnType<typeof setInterval> | null = null

// ── Computed ────────────────────────────────────────────────────────────

const boardCells = computed(() => {
  const cells: { x: number; y: number; snake: boolean; head: boolean; food: boolean }[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const isHead = snake.value[0]?.x === x && snake.value[0]?.y === y
      const isBody = snake.value.some((p, i) => i > 0 && p.x === x && p.y === y)
      const isFood = food.value.x === x && food.value.y === y
      cells.push({ x, y, snake: isBody, head: isHead, food: isFood })
    }
  }
  return cells
})

const boardStyle = computed(() => ({
  gridTemplateColumns: `repeat(${COLS}, 1fr)`,
  gridTemplateRows: `repeat(${ROWS}, 1fr)`,
}))

const isNewHighScore = computed(() => score.value > 0 && score.value >= highScore.value && phase.value === 'gameover')

// ── Helpers ─────────────────────────────────────────────────────────────

function loadHighScore(): number {
  try {
    const stored = localStorage.getItem('snake-high-score')
    return stored ? parseInt(stored, 10) : 0
  } catch {
    return 0
  }
}

function saveHighScore(value: number): void {
  try {
    localStorage.setItem('snake-high-score', String(value))
  } catch {
    // ignore storage errors
  }
}

function randomFoodPosition(): Position {
  const occupied = new Set(snake.value.map((p) => `${p.x},${p.y}`))
  const available: Position[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied.has(`${x},${y}`)) {
        available.push({ x, y })
      }
    }
  }
  if (available.length === 0) {
    return { x: 0, y: 0 }
  }
  return available[Math.floor(Math.random() * available.length)]
}

function isCollision(pos: Position): boolean {
  if (pos.x < 0 || pos.x >= COLS || pos.y < 0 || pos.y >= ROWS) {
    return true
  }
  return snake.value.some((p) => p.x === pos.x && p.y === pos.y)
}

function getNewHead(): Position {
  const head = snake.value[0]
  switch (direction.value) {
    case 'up':
      return { x: head.x, y: head.y - 1 }
    case 'down':
      return { x: head.x, y: head.y + 1 }
    case 'left':
      return { x: head.x - 1, y: head.y }
    case 'right':
      return { x: head.x + 1, y: head.y }
  }
}

function isOppositeDirection(newDir: Direction): boolean {
  const opposites: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  }
  return opposites[newDir] === direction.value
}

// ── Game Logic ──────────────────────────────────────────────────────────

function startGame(): void {
  snake.value = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]
  direction.value = 'right'
  nextDirection.value = 'right'
  score.value = 0
  speed.value = INITIAL_SPEED
  food.value = randomFoodPosition()
  phase.value = 'playing'
  startGameLoop()
}

function pauseGame(): void {
  if (phase.value === 'playing') {
    phase.value = 'paused'
    stopGameLoop()
  }
}

function resumeGame(): void {
  if (phase.value === 'paused') {
    phase.value = 'playing'
    startGameLoop()
  }
}

function togglePause(): void {
  if (phase.value === 'playing') {
    pauseGame()
  } else if (phase.value === 'paused') {
    resumeGame()
  }
}

function gameOver(): void {
  phase.value = 'gameover'
  stopGameLoop()
  if (score.value > highScore.value) {
    highScore.value = score.value
    saveHighScore(highScore.value)
  }
}

function gameStep(): void {
  direction.value = nextDirection.value
  const newHead = getNewHead()

  if (isCollision(newHead)) {
    gameOver()
    return
  }

  snake.value.unshift(newHead)

  if (newHead.x === food.value.x && newHead.y === food.value.y) {
    score.value += 10
    food.value = randomFoodPosition()
    speed.value = Math.max(MIN_SPEED, speed.value - SPEED_INCREMENT)
    restartGameLoop()
  } else {
    snake.value.pop()
  }
}

function startGameLoop(): void {
  stopGameLoop()
  gameTimer = setInterval(gameStep, speed.value)
}

function stopGameLoop(): void {
  if (gameTimer !== null) {
    clearInterval(gameTimer)
    gameTimer = null
  }
}

function restartGameLoop(): void {
  if (gameTimer !== null) {
    clearInterval(gameTimer)
    gameTimer = setInterval(gameStep, speed.value)
  }
}

// ── Input Handlers ──────────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent): void {
  if (phase.value === 'start') {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      startGame()
      return
    }
  }

  if (phase.value === 'gameover') {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      startGame()
      return
    }
    return
  }

  if (e.key === ' ' || e.key === 'Escape') {
    e.preventDefault()
    togglePause()
    return
  }

  if (phase.value !== 'playing') {
    return
  }

  const keyDirections: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
    W: 'up',
    S: 'down',
    A: 'left',
    D: 'right',
  }

  const newDir = keyDirections[e.key]
  if (newDir && !isOppositeDirection(newDir)) {
    e.preventDefault()
    nextDirection.value = newDir
  }
}

function handleDirection(d: Direction): void {
  if (phase.value === 'start' || phase.value === 'gameover') {
    return
  }

  if (phase.value === 'playing' && !isOppositeDirection(d)) {
    nextDirection.value = d
    return
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────

onMounted(() => {
  highScore.value = loadHighScore()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  stopGameLoop()
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="game-container">
    <!-- Header -->
    <div class="game-header">
      <h1>🐍 贪吃蛇</h1>
      <p>经典贪吃蛇游戏</p>
    </div>

    <!-- Score Panel -->
    <div class="score-panel">
      <div class="score-item">
        <div class="label">当前分数</div>
        <div class="value">{{ score }}</div>
      </div>
      <div class="score-item">
        <div class="label">最高分</div>
        <div class="value">{{ highScore }}</div>
      </div>
    </div>

    <!-- Game Board -->
    <div class="game-board-wrapper" style="position: relative;">
      <div class="game-board" :style="boardStyle">
        <div
          v-for="cell in boardCells"
          :key="`${cell.x}-${cell.y}`"
          class="cell"
          :class="{
            'snake-head': cell.head,
            'snake-body': cell.snake,
            'food': cell.food,
          }"
        />
      </div>

      <!-- Pause Indicator -->
      <div v-if="phase === 'paused'" class="pause-indicator">
        已暂停
      </div>
    </div>

    <!-- Start Screen -->
    <div v-if="phase === 'start'" class="start-screen">
      <h2>准备好了吗？</h2>
      <p>使用方向键控制蛇的移动方向，吃到红色食物来增长身体并获得分数。</p>
      <div class="instructions">
        <h3>操作说明</h3>
        <ul>
          <li>方向键 ↑ ↓ ← → 控制移动</li>
          <li>空格键 开始 / 暂停游戏</li>
          <li>撞墙或撞到自己游戏结束</li>
          <li>吃到食物得 10 分</li>
        </ul>
      </div>
      <button class="btn btn-primary" @click="startGame">
        开始游戏
      </button>
    </div>

    <!-- Game Over Screen -->
    <div v-if="phase === 'gameover'" class="game-over-overlay" @click.self="startGame">
      <div class="game-over-modal">
        <h2>游戏结束！</h2>
        <div class="final-score">{{ score }}</div>
        <div v-if="isNewHighScore" class="new-high">🏆 新纪录！</div>
        <p v-else style="color: var(--text-secondary); margin-bottom: 16px;">
          继续努力！
        </p>
        <button class="btn btn-primary" @click="startGame">
          重新开始
        </button>
      </div>
    </div>

    <!-- Playing Controls -->
    <template v-if="phase === 'playing' || phase === 'paused'">
      <!-- D-Pad -->
      <div class="controls">
        <div class="control-row">
          <button
            class="control-btn"
            @click="handleDirection('up')"
            aria-label="向上"
          >
            ↑
          </button>
        </div>
        <div class="control-row">
          <button
            class="control-btn"
            @click="handleDirection('left')"
            aria-label="向左"
          >
            ←
          </button>
          <button
            class="control-btn"
            @click="togglePause"
            aria-label="暂停"
            style="font-size: 0.9rem;"
          >
            {{ phase === 'paused' ? '▶' : '⏸' }}
          </button>
          <button
            class="control-btn"
            @click="handleDirection('right')"
            aria-label="向右"
          >
            →
          </button>
        </div>
        <div class="control-row">
          <button
            class="control-btn"
            @click="handleDirection('down')"
            aria-label="向下"
          >
            ↓
          </button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button v-if="phase === 'paused'" class="btn btn-primary" @click="resumeGame">
          继续游戏
        </button>
        <button class="btn btn-danger" @click="startGame">
          重新开始
        </button>
      </div>
    </template>

    <!-- Continue in Mitosis -->
    <a
      href="https://mitosis.zenheart.site?ref=snake-game"
      target="_blank"
      rel="noopener noreferrer"
      class="continue-btn"
    >
      🧬 在 Mitosis 中继续迭代
    </a>
  </div>
</template>
