<!-- Snake Game - Vue 3 + TypeScript + Vite -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import './assets/main.css'

// ── Types ────────────────────────────────────────────────────────────────

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
type CellValue = 0 | 1 // 0: empty, 1: snake

interface Position {
  x: number
  y: number
}

interface GameState {
  board: CellValue[][]
  snake: Position[]
  food: Position
  direction: Direction
  nextDirection: Direction
  score: number
  level: number
  speed: number
  isRunning: boolean
  isGameOver: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────

const COLS = 20
const ROWS = 20
const INITIAL_SPEED = 150
const SPEED_DECREASE_PER_LEVEL = 10
const MIN_SPEED = 50

const DIRECTIONS: Record<Direction, Position> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
}

const OPPOSITE_DIRECTIONS: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

// ── Game State ────────────────────────────────────────────────────────────

function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => 0 as CellValue)
  )
}

function initializeSnake(): Position[] {
  const centerX = Math.floor(COLS / 2)
  const centerY = Math.floor(ROWS / 2)
  return [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY },
  ]
}

const gameState = reactive<GameState>({
  board: createEmptyBoard(),
  snake: initializeSnake(),
  food: { x: 0, y: 0 },
  direction: 'RIGHT',
  nextDirection: 'RIGHT',
  score: 0,
  level: 1,
  speed: INITIAL_SPEED,
  isRunning: false,
  isGameOver: false,
})

// ── Computed Properties ───────────────────────────────────────────────────

const boardStyle = computed(() => ({
  gridTemplateColumns: `repeat(${COLS}, 20px)`,
  gridTemplateRows: `repeat(${ROWS}, 20px)`,
}))

const gameBoard = computed(() => gameState.board)
const currentScore = computed(() => gameState.score)
const currentLevel = computed(() => gameState.level)
const gameStatus = computed(() => {
  if (gameState.isGameOver) return '游戏结束'
  if (gameState.isRunning) return '游戏中'
  return '准备开始'
})
const canStart = computed(() => !gameState.isRunning && !gameState.isGameOver)
const canRestart = computed(() => gameState.isGameOver)

// ── Helper Functions ──────────────────────────────────────────────────────

function generateFood(): Position {
  const emptyCells: Position[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (gameState.board[y][x] === 0) {
        emptyCells.push({ x, y })
      }
    }
  }

  if (emptyCells.length === 0) {
    return { x: 0, y: 0 }
  }

  const randomIndex = Math.floor(Math.random() * emptyCells.length)
  return emptyCells[randomIndex]
}

function updateBoard(): void {
  // Clear board
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      gameState.board[y][x] = 0
    }
  }

  // Draw snake
  gameState.snake.forEach((pos) => {
    if (pos.y >= 0 && pos.y < ROWS && pos.x >= 0 && pos.x < COLS) {
      gameState.board[pos.y][pos.x] = 1
    }
  })
}

function getCellClass(rowIndex: number, colIndex: number): string {
  const isSnakeHead =
    gameState.snake[0]?.x === colIndex && gameState.snake[0]?.y === rowIndex
  const isSnake = gameState.snake.some(
    (pos) => pos.x === colIndex && pos.y === rowIndex
  )
  const isFood = gameState.food.x === colIndex && gameState.food.y === rowIndex

  if (isSnakeHead) return 'cell snake-head'
  if (isSnake) return 'cell snake'
  if (isFood) return 'cell food'
  return 'cell'
}

// ── Game Logic ────────────────────────────────────────────────────────────

function startGame(): void {
  if (gameState.isRunning || gameState.isGameOver) return

  gameState.snake = initializeSnake()
  gameState.direction = 'RIGHT'
  gameState.nextDirection = 'RIGHT'
  gameState.score = 0
  gameState.level = 1
  gameState.speed = INITIAL_SPEED
  gameState.isGameOver = false
  gameState.food = generateFood()
  updateBoard()
  gameState.isRunning = true
}

function restartGame(): void {
  gameState.isRunning = false
  gameState.isGameOver = false
  startGame()
}

function stopGame(): void {
  gameState.isRunning = false
}

function moveSnake(): void {
  if (!gameState.isRunning || gameState.isGameOver) return

  gameState.direction = gameState.nextDirection

  const head = gameState.snake[0]
  const movement = DIRECTIONS[gameState.direction]
  const newHead: Position = {
    x: head.x + movement.x,
    y: head.y + movement.y,
  }

  // Check wall collision
  if (
    newHead.x < 0 ||
    newHead.x >= COLS ||
    newHead.y < 0 ||
    newHead.y >= ROWS
  ) {
    endGame()
    return
  }

  // Check self collision
  if (
    gameState.snake.some(
      (segment) => segment.x === newHead.x && segment.y === newHead.y
    )
  ) {
    endGame()
    return
  }

  // Add new head
  gameState.snake.unshift(newHead)

  // Check food collision
  if (newHead.x === gameState.food.x && newHead.y === gameState.food.y) {
    gameState.score += 10

    // Level up every 50 points
    const newLevel = Math.floor(gameState.score / 50) + 1
    if (newLevel > gameState.level) {
      gameState.level = newLevel
      gameState.speed = Math.max(
        MIN_SPEED,
        INITIAL_SPEED - (gameState.level - 1) * SPEED_DECREASE_PER_LEVEL
      )
    }

    gameState.food = generateFood()
  } else {
    gameState.snake.pop()
  }

  updateBoard()
}

function endGame(): void {
  gameState.isRunning = false
  gameState.isGameOver = true
}

function changeDirection(newDirection: Direction): void {
  if (!gameState.isRunning) return

  if (OPPOSITE_DIRECTIONS[newDirection] === gameState.direction) {
    return
  }

  gameState.nextDirection = newDirection
}

// ── Game Loop ─────────────────────────────────────────────────────────────

let gameLoopInterval: number | null = null

function gameLoop(): void {
  moveSnake()
}

function startGameLoop(): void {
  if (gameLoopInterval !== null) {
    clearInterval(gameLoopInterval)
  }
  gameLoopInterval = setInterval(gameLoop, gameState.speed)
}

function stopGameLoop(): void {
  if (gameLoopInterval !== null) {
    clearInterval(gameLoopInterval)
    gameLoopInterval = null
  }
}

watch(
  () => gameState.speed,
  () => {
    if (gameState.isRunning) {
      startGameLoop()
    }
  }
)

watch(
  () => gameState.isRunning,
  (isRunning) => {
    if (isRunning) {
      startGameLoop()
    } else {
      stopGameLoop()
    }
  }
)

// ── Keyboard Controls ─────────────────────────────────────────────────────

function handleKeyDown(event: KeyboardEvent): void {
  if (!gameState.isRunning) return

  switch (event.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      event.preventDefault()
      changeDirection('UP')
      break
    case 'ArrowDown':
    case 's':
    case 'S':
      event.preventDefault()
      changeDirection('DOWN')
      break
    case 'ArrowLeft':
    case 'a':
    case 'A':
      event.preventDefault()
      changeDirection('LEFT')
      break
    case 'ArrowRight':
    case 'd':
    case 'D':
      event.preventDefault()
      changeDirection('RIGHT')
      break
  }
}

// ── Lifecycle Hooks ───────────────────────────────────────────────────────

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  stopGameLoop()
})
</script>

<template>
  <div class="game-container">
    <h1 class="game-title">🐍 贪吃蛇</h1>

    <div class="game-header">
      <div class="score-display">分数: {{ currentScore }}</div>
      <div class="level-display">等级: {{ currentLevel }}</div>
      <div class="status-display">状态: {{ gameStatus }}</div>
    </div>

    <div class="game-board" :style="boardStyle">
      <div
        v-for="(row, rowIndex) in gameBoard"
        :key="rowIndex"
        class="row"
      >
        <div
          v-for="(_, colIndex) in row"
          :key="`${rowIndex}-${colIndex}`"
          class="cell"
          :class="getCellClass(rowIndex, colIndex)"
        />
      </div>
    </div>

    <div class="game-controls">
      <div class="control-buttons">
        <button
          v-if="canStart"
          class="btn btn-primary"
          @click="startGame"
        >
          开始游戏
        </button>
        <button
          v-if="canRestart"
          class="btn btn-primary"
          @click="restartGame"
        >
          重新开始
        </button>
        <button
          class="btn btn-secondary"
          @click="stopGame"
          :disabled="!gameState.isRunning"
        >
          暂停
        </button>
      </div>

      <div class="direction-controls">
        <button
          class="direction-btn up"
          @click="changeDirection('UP')"
          :disabled="!gameState.isRunning"
          aria-label="向上"
        >
          ↑
        </button>
        <button
          class="direction-btn left"
          @click="changeDirection('LEFT')"
          :disabled="!gameState.isRunning"
          aria-label="向左"
        >
          ←
        </button>
        <button
          class="direction-btn right"
          @click="changeDirection('RIGHT')"
          :disabled="!gameState.isRunning"
          aria-label="向右"
        >
          →
        </button>
        <button
          class="direction-btn down"
          @click="changeDirection('DOWN')"
          :disabled="!gameState.isRunning"
          aria-label="向下"
        >
          ↓
        </button>
      </div>
    </div>

    <div class="instructions">
      <p><strong>操作说明:</strong></p>
      <p>
        使用 <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> 或 <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 控制方向
      </p>
      <p>吃到红色食物获得分数，每 50 分升一级，速度会加快！</p>
    </div>

    <div v-if="gameState.isGameOver" class="game-over-overlay">
      <div class="game-over-content">
        <h2 class="game-over-title">游戏结束！</h2>
        <p class="game-over-score">最终得分: {{ currentScore }}</p>
        <p class="game-over-level">达到等级: {{ currentLevel }}</p>
        <button class="btn btn-primary" @click="restartGame">
          再玩一次
        </button>
      </div>
    </div>
  </div>
</template>
