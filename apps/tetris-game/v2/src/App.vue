<!-- Tetris Game v2 - Enhanced Edition -->
<script setup lang="ts">
import {
  reactive,
  computed,
  ref,
  onMounted,
  onUnmounted,
  watch,
} from 'vue'
import './assets/main.css'

// ── Types ──────────────────────────────────────────────────────────────

type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

interface Piece {
  type: number
  shape: number[][]
  x: number
  y: number
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  color: string
  life: number
  maxLife: number
  size: number
}

interface GameState {
  board: CellValue[][]
  currentPiece: Piece | null
  nextPiece: Piece | null
  holdPiece: number | null
  canHold: boolean
  score: number
  lines: number
  level: number
  combo: number
  isRunning: boolean
  isGameOver: boolean
  lastClearType: string
}

// ── Constants ───────────────────────────────────────────────────────────

const COLS = 10
const ROWS = 20

const TETROMINOES: { shape: number[][]; color: number }[] = [
  { shape: [[1, 1, 1, 1]], color: 1 },           // I - Cyan
  { shape: [[1, 1], [1, 1]], color: 2 },          // O - Yellow
  { shape: [[0, 1, 0], [1, 1, 1]], color: 3 },    // T - Purple
  { shape: [[0, 1, 1], [1, 1, 0]], color: 4 },    // S - Green
  { shape: [[1, 1, 0], [0, 1, 1]], color: 5 },    // Z - Red
  { shape: [[1, 0, 0], [1, 1, 1]], color: 6 },    // J - Blue
  { shape: [[0, 0, 1], [1, 1, 1]], color: 7 },    // L - Orange
]

const COLORS: Record<number, string> = {
  0: 'transparent',
  1: '#00e5ff',  // I - Cyan
  2: '#ffd600',  // O - Yellow
  3: '#aa00ff',  // T - Purple
  4: '#00e676',  // S - Green
  5: '#ff1744',  // Z - Red
  6: '#2979ff',  // J - Blue
  7: '#ff9100',  // L - Orange
}

const GLOW_COLORS: Record<number, string> = {
  1: 'rgba(0, 229, 255, 0.6)',
  2: 'rgba(255, 214, 0, 0.6)',
  3: 'rgba(170, 0, 255, 0.6)',
  4: 'rgba(0, 230, 118, 0.6)',
  5: 'rgba(255, 23, 68, 0.6)',
  6: 'rgba(41, 121, 255, 0.6)',
  7: 'rgba(255, 145, 0, 0.6)',
}

const SPEEDS = [800, 720, 630, 550, 470, 380, 300, 220, 150, 100, 80, 60, 50, 40, 30]

const LINE_SCORES = [0, 100, 300, 500, 800]
const COMBO_MULTIPLIER = 50

// ── Game State ──────────────────────────────────────────────────────────

const state = reactive<GameState>({
  board: createEmptyBoard(),
  currentPiece: null,
  nextPiece: null,
  holdPiece: null,
  canHold: true,
  score: 0,
  lines: 0,
  level: 1,
  combo: -1,
  isRunning: false,
  isGameOver: false,
  lastClearType: '',
})

let timerId: ReturnType<typeof setInterval> | null = null
const bag: number[] = []

// ── Particles ───────────────────────────────────────────────────────────

const particles = ref<Particle[]>([])
let particleId = 0
const MAX_PARTICLES = 30 // 粒子上限，防止卡顿

function spawnParticles(row: number, color: string): void {
  // 每 3 个格子生成 1 个粒子（4 个/行），减少 DOM 数量
  const newParticles: Particle[] = []
  for (let c = 0; c < COLS; c += 3) {
    newParticles.push({
      id: particleId++,
      x: c * 30 + 15 + (Math.random() - 0.5) * 20,
      y: row * 30 + 15,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3 - 1.5,
      color,
      life: 1,
      maxLife: 1,
      size: Math.random() * 2.5 + 1.5,
    })
  }
  const combined = [...particles.value, ...newParticles]
  particles.value = combined.length > MAX_PARTICLES
    ? combined.slice(combined.length - MAX_PARTICLES)
    : combined
}

function updateParticles(): void {
  particles.value = particles.value
    .map((p) => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + 0.25,
      life: p.life - 0.03,
    }))
    .filter((p) => p.life > 0)
}

// ── Helpers ─────────────────────────────────────────────────────────────

function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: ROWS }, () => Array<CellValue>(COLS).fill(0))
}

function randomPiece(): Piece {
  if (bag.length === 0) {
    bag.push(...Array.from({ length: 7 }, (_, i) => i))
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
  }
  const idx = bag.pop()!
  const t = TETROMINOES[idx]
  return {
    type: idx,
    shape: t.shape.map((r) => [...r]),
    x: Math.floor((COLS - t.shape[0].length) / 2),
    y: 0,
  }
}

function getSpeed(level: number): number {
  return SPEEDS[Math.min(level - 1, SPEEDS.length - 1)]
}

function collides(piece: Piece, board: CellValue[][]): boolean {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue
      const nx = piece.x + c
      const ny = piece.y + r
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true
      if (ny >= 0 && board[ny][nx] !== 0) return true
    }
  }
  return false
}

function lockPiece(piece: Piece, board: CellValue[][]): void {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue
      const ny = piece.y + r
      const nx = piece.x + c
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        board[ny][nx] = piece.type + 1 as CellValue
      }
    }
  }
}

function clearLines(board: CellValue[][]): { cleared: number; rows: number[] } {
  const clearedRows: number[] = []
  let cleared = 0
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every((c) => c !== 0)) {
      clearedRows.push(r)
      board.splice(r, 1)
      board.unshift(Array<CellValue>(COLS).fill(0))
      cleared++
      r++ // re-check this row
    }
  }
  return { cleared, rows: clearedRows }
}

function rotateCW(shape: number[][]): number[][] {
  const rows = shape.length
  const cols = shape[0].length
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => shape[rows - 1 - r][c])
  )
}

function rotateCCW(shape: number[][]): number[][] {
  const rows = shape.length
  const cols = shape[0].length
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => shape[r][cols - 1 - c])
  )
}

// ── Game Actions ────────────────────────────────────────────────────────

function startGame(): void {
  stopTimer()
  state.board = createEmptyBoard()
  state.score = 0
  state.lines = 0
  state.level = 1
  state.combo = -1
  state.isGameOver = false
  state.holdPiece = null
  state.canHold = true
  state.currentPiece = randomPiece()
  state.nextPiece = randomPiece()
  state.lastClearType = ''
  particles.value = []
  state.isRunning = true
  startTimer()
}

function pauseGame(): void {
  if (!state.isRunning || state.isGameOver) return
  state.isRunning = false
  stopTimer()
}

function resumeGame(): void {
  if (state.isGameOver || state.isRunning) return
  state.isRunning = true
  startTimer()
}

function stopTimer(): void {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

function startTimer(): void {
  stopTimer()
  timerId = setInterval(tick, getSpeed(state.level))
}

function tick(): void {
  if (!state.isRunning || !state.currentPiece || state.isGameOver) return
  updateParticles()

  const moved = { ...state.currentPiece, y: state.currentPiece.y + 1 }
  if (!collides(moved, state.board)) {
    state.currentPiece.y = moved.y
  } else {
    lockPiece(state.currentPiece, state.board)
    const { cleared, rows } = clearLines(state.board)

    // Spawn particles for cleared lines
    if (cleared > 0) {
      rows.forEach((row) => {
        for (let c = 0; c < COLS; c++) {
          const cell = state.board[row][c]
          if (cell !== 0) {
            spawnParticles(row, COLORS[cell])
          }
        }
      })
      state.combo++
      let lineScore = LINE_SCORES[cleared]! * state.level
      if (state.combo > 0) {
        lineScore += COMBO_MULTIPLIER * state.combo * state.level
      }
      state.score += lineScore
      state.lines += cleared

      // Set clear type for display
      if (cleared === 4) {
        state.lastClearType = 'TETRIS!'
      } else if (cleared === 3) {
        state.lastClearType = 'TRIPLE!'
      } else if (cleared === 2) {
        state.lastClearType = 'DOUBLE!'
      } else {
        state.lastClearType = ''
      }
      if (state.combo > 0) {
        state.lastClearType += ` COMBO x${state.combo}!`
      }

      const newLevel = Math.floor(state.lines / 10) + 1
      if (newLevel !== state.level) {
        state.level = newLevel
        startTimer()
      }
    } else {
      state.combo = -1
      state.lastClearType = ''
    }

    state.currentPiece = state.nextPiece!
    state.nextPiece = randomPiece()
    state.canHold = true
    if (collides(state.currentPiece, state.board)) {
      state.isGameOver = true
      state.isRunning = false
      state.currentPiece = null
      stopTimer()
    }
  }
}

function moveHorizontal(dir: number): void {
  if (!state.isRunning || !state.currentPiece || state.isGameOver) return
  const moved = { ...state.currentPiece, x: state.currentPiece.x + dir }
  if (!collides(moved, state.board)) {
    state.currentPiece.x = moved.x
  }
}

function rotatePiece(): void {
  if (!state.isRunning || !state.currentPiece || state.isGameOver) return
  const rotated = rotateCW(state.currentPiece.shape)
  const kicks = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [-2, 0],
    [2, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
  ]
  for (const [dx, dy] of kicks) {
    const test = {
      ...state.currentPiece,
      shape: rotated,
      x: state.currentPiece.x + dx,
      y: state.currentPiece.y + dy,
    }
    if (!collides(test, state.board)) {
      state.currentPiece.shape = rotated
      state.currentPiece.x = test.x
      state.currentPiece.y = test.y
      return
    }
  }
}

function rotatePieceCCW(): void {
  if (!state.isRunning || !state.currentPiece || state.isGameOver) return
  const rotated = rotateCCW(state.currentPiece.shape)
  const kicks = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [2, 0],
    [-2, 0],
    [0, -1],
    [1, -1],
    [-1, -1],
  ]
  for (const [dx, dy] of kicks) {
    const test = {
      ...state.currentPiece,
      shape: rotated,
      x: state.currentPiece.x + dx,
      y: state.currentPiece.y + dy,
    }
    if (!collides(test, state.board)) {
      state.currentPiece.shape = rotated
      state.currentPiece.x = test.x
      state.currentPiece.y = test.y
      return
    }
  }
}

function softDrop(): void {
  if (!state.isRunning || !state.currentPiece || state.isGameOver) return
  const moved = { ...state.currentPiece, y: state.currentPiece.y + 1 }
  if (!collides(moved, state.board)) {
    state.currentPiece.y = moved.y
    state.score += 1
  }
}

function hardDrop(): void {
  if (!state.isRunning || !state.currentPiece || state.isGameOver) return
  let dropped = 0
  while (true) {
    const test = { ...state.currentPiece, y: state.currentPiece.y + 1 }
    if (collides(test, state.board)) break
    state.currentPiece.y = test.y
    dropped++
  }
  state.score += dropped * 2
  tick()
}

function holdPiece(): void {
  if (!state.isRunning || !state.currentPiece || state.isGameOver || !state.canHold) return

  const currentType = state.currentPiece.type
  if (state.holdPiece === null) {
    state.holdPiece = currentType
    state.currentPiece = state.nextPiece!
    state.nextPiece = randomPiece()
  } else {
    const holdType = state.holdPiece
    state.holdPiece = currentType
    const t = TETROMINOES[currentType]
    state.currentPiece = {
      type: holdType,
      shape: t.shape.map((r) => [...r]),
      x: Math.floor((COLS - t.shape[0].length) / 2),
      y: 0,
    }
  }
  state.canHold = false
}

// ── Board Rendering ─────────────────────────────────────────────────────

const displayBoard = computed<CellValue[][]>(() => {
  const display = state.board.map((row) => [...row])
  if (state.currentPiece) {
    const p = state.currentPiece
    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r].length; c++) {
        if (p.shape[r][c]) {
          const ny = p.y + r
          const nx = p.x + c
          if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
            display[ny][nx] = (p.type + 1) as CellValue
          }
        }
      }
    }
  }
  return display
})

const ghostY = computed<number>(() => {
  if (!state.currentPiece) return 0
  let gy = state.currentPiece.y
  while (true) {
    const test = { ...state.currentPiece, y: gy + 1 }
    if (collides(test, state.board)) break
    gy++
  }
  return gy
})

// ── Hold Piece Shape ────────────────────────────────────────────────────

const holdShape = computed<number[][] | null>(() => {
  if (state.holdPiece === null) return null
  return TETROMINOES[state.holdPiece].shape
})

const holdColor = computed<number>(() => {
  if (state.holdPiece === null) return 0
  return TETROMINOES[state.holdPiece].color
})

// ── Next Piece Shape ────────────────────────────────────────────────────

const nextShape = computed<number[][] | null>(() => {
  if (!state.nextPiece) return null
  return state.nextPiece.shape
})

const nextColor = computed<number>(() => {
  if (!state.nextPiece) return 0
  return state.nextPiece.type + 1
})

// ── Clear Message ───────────────────────────────────────────────────────

const clearMessage = ref<string>('')
let clearMessageTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => state.lastClearType,
  (newVal) => {
    if (newVal && state.isRunning) {
      clearMessage.value = newVal
      if (clearMessageTimer) clearTimeout(clearMessageTimer)
      clearMessageTimer = setTimeout(() => {
        clearMessage.value = ''
      }, 1500)
    }
  }
)

// ── Input Handling ──────────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent): void {
  if (state.isGameOver) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      startGame()
    }
    return
  }
  if (!state.isRunning && state.board.every((r) => r.every((c) => c === 0))) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      startGame()
    }
    return
  }

  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      e.preventDefault()
      moveHorizontal(-1)
      break
    case 'ArrowRight':
    case 'd':
    case 'D':
      e.preventDefault()
      moveHorizontal(1)
      break
    case 'ArrowDown':
    case 's':
    case 'S':
      e.preventDefault()
      softDrop()
      break
    case 'ArrowUp':
    case 'w':
    case 'W':
      e.preventDefault()
      rotatePiece()
      break
    case 'z':
    case 'Z':
      e.preventDefault()
      rotatePieceCCW()
      break
    case ' ':
      e.preventDefault()
      hardDrop()
      break
    case 'c':
    case 'C':
      e.preventDefault()
      holdPiece()
      break
    case 'p':
    case 'P':
    case 'Escape':
      e.preventDefault()
      if (state.isRunning) pauseGame()
      else resumeGame()
      break
    case 'Enter':
      if (!state.isRunning && !state.isGameOver) {
        e.preventDefault()
        resumeGame()
      }
      break
  }
}

// ── Touch Controls ──────────────────────────────────────────────────────

const touchStartX = ref(0)
const touchStartY = ref(0)
const touchStartTime = ref(0)

function handleTouchStart(e: TouchEvent): void {
  if (!state.isRunning || state.isGameOver) return
  const touch = e.touches[0]
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
  touchStartTime.value = Date.now()
}

function handleTouchEnd(e: TouchEvent): void {
  if (!state.isRunning || state.isGameOver) return
  const touch = e.changedTouches[0]
  const dx = touch.clientX - touchStartX.value
  const dy = touch.clientY - touchStartY.value
  const dt = Date.now() - touchStartTime.value

  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (absDx < 30 && absDy < 30 && dt < 200) {
    // Tap - rotate
    rotatePiece()
  } else if (absDx > absDy) {
    // Horizontal swipe
    if (dx > 0) moveHorizontal(1)
    else moveHorizontal(-1)
  } else if (dy > absDx && dy > 50) {
    // Down swipe - soft drop
    softDrop()
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('touchstart', handleTouchStart, { passive: true })
  window.addEventListener('touchend', handleTouchEnd)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('touchstart', handleTouchStart)
  window.removeEventListener('touchend', handleTouchEnd)
  stopTimer()
  if (clearMessageTimer) clearTimeout(clearMessageTimer)
})
</script>

<template>
  <div class="game-container" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <!-- Header -->
    <header class="game-header">
      <h1 class="game-title">TETRIS</h1>
      <span class="game-subtitle">俄罗斯方块 v2</span>
    </header>

    <div class="game-layout">
      <!-- Side Panel Left -->
      <aside class="side-panel left-panel">
        <!-- Hold -->
        <div class="panel-box">
          <h3 class="panel-label">HOLD</h3>
          <div class="hold-grid">
            <template v-if="holdShape">
              <div
                v-for="(_row, r) in 4"
                :key="'hr' + r"
                class="hold-row"
              >
                <div
                  v-for="(_, c) in 4"
                  :key="'hc' + r + '-' + c"
                  class="hold-cell"
                  :class="{
                    filled:
                      holdShape &&
                      holdShape[r]?.[c],
                    dimmed: !state.canHold && state.isRunning,
                  }"
                  :style="
                    holdShape?.[r]?.[c]
                      ? {
                          backgroundColor: COLORS[holdColor],
                          boxShadow: `0 0 8px ${GLOW_COLORS[holdColor]}`,
                        }
                      : {}
                  "
                />
              </div>
            </template>
            <div v-else class="hold-empty">-</div>
          </div>
        </div>

        <!-- Score -->
        <div class="panel-box">
          <h3 class="panel-label">SCORE</h3>
          <div class="score-value">{{ state.score.toLocaleString() }}</div>
        </div>

        <!-- Level -->
        <div class="panel-box">
          <h3 class="panel-label">LEVEL</h3>
          <div class="level-value">{{ state.level }}</div>
        </div>

        <!-- Lines -->
        <div class="panel-box">
          <h3 class="panel-label">LINES</h3>
          <div class="lines-value">{{ state.lines }}</div>
        </div>

        <!-- Combo -->
        <div v-if="state.combo > 0" class="panel-box combo-box">
          <h3 class="panel-label">COMBO</h3>
          <div class="combo-value">x{{ state.combo }}</div>
        </div>
      </aside>

      <!-- Game Board -->
      <main class="board-wrapper">
        <div class="board-container">
          <!-- Grid lines via CSS background (no DOM nodes) -->

          <!-- Rendered cells -->
          <div class="board-cells">
            <div
              v-for="(row, r) in displayBoard"
              :key="'cell-' + r"
              class="board-row"
            >
              <div
                v-for="(cell, c) in row"
                :key="'cell-' + r + '-' + c"
                class="board-cell"
                :class="{
                  filled: cell !== 0,
                  ghost:
                    cell === 0 &&
                    state.currentPiece &&
                    r >= ghostY &&
                    r < ghostY + state.currentPiece.shape.length &&
                    state.currentPiece.shape[r - ghostY]?.[c],
                }"
                :style="
                  cell !== 0
                    ? {
                        backgroundColor: COLORS[cell],
                      }
                    : {}
                "
              />
            </div>
          </div>

          <!-- Particles -->
          <div class="particles-container">
            <div
              v-for="p in particles"
              :key="p.id"
              class="particle"
              :style="{
                transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
                width: p.size + 'px',
                height: p.size + 'px',
                backgroundColor: p.color,
                opacity: p.life,
              }"
            />
          </div>

          <!-- Clear Message -->
          <div v-if="clearMessage" class="clear-message" :class="clearMessage.includes('TETRIS') ? 'tetris' : ''">
            {{ clearMessage }}
          </div>

          <!-- Game Over Overlay -->
          <div v-if="state.isGameOver" class="overlay game-over-overlay">
            <div class="overlay-content">
              <h2 class="overlay-title">GAME OVER</h2>
              <p class="overlay-score">得分: {{ state.score.toLocaleString() }}</p>
              <p class="overlay-stats">消除 {{ state.lines }} 行 · 等级 {{ state.level }}</p>
              <p class="overlay-hint">按 Enter 重新开始</p>
            </div>
          </div>

          <!-- Idle Overlay -->
          <div
            v-if="
              !state.isRunning &&
              !state.isGameOver &&
              state.board.every((r) => r.every((c) => c === 0))
            "
            class="overlay idle-overlay"
          >
            <div class="overlay-content">
              <h2 class="overlay-title">TETRIS v2</h2>
              <p class="overlay-hint">按 空格键 开始游戏</p>
            </div>
          </div>

          <!-- Pause Overlay -->
          <div
            v-if="
              !state.isRunning &&
              !state.isGameOver &&
              !state.board.every((r) => r.every((c) => c === 0))
            "
            class="overlay pause-overlay"
          >
            <div class="overlay-content">
              <h2 class="overlay-title">PAUSED</h2>
              <p class="overlay-hint">按 P 或 Enter 继续</p>
            </div>
          </div>
        </div>
      </main>

      <!-- Side Panel Right -->
      <aside class="side-panel right-panel">
        <!-- Next Piece -->
        <div class="panel-box">
          <h3 class="panel-label">NEXT</h3>
          <div class="next-grid">
            <template v-if="nextShape">
              <div
                v-for="(_row, r) in 4"
                :key="'nr' + r"
                class="next-row"
              >
                <div
                  v-for="(_, c) in 4"
                  :key="'nc' + r + '-' + c"
                  class="next-cell"
                  :class="{
                    filled:
                      nextShape &&
                      nextShape[r]?.[c],
                  }"
                  :style="
                    nextShape?.[r]?.[c]
                      ? {
                          backgroundColor: COLORS[nextColor],
                          boxShadow: `0 0 8px ${GLOW_COLORS[nextColor]}`,
                        }
                      : {}
                  "
                />
              </div>
            </template>
            <div v-else class="next-empty">-</div>
          </div>
        </div>

        <!-- Controls -->
        <div class="panel-box controls-box">
          <h3 class="panel-label">CONTROLS</h3>
          <div class="controls-list">
            <div class="control-item">
              <kbd>← →</kbd>
              <span>移动</span>
            </div>
            <div class="control-item">
              <kbd>↑ / W</kbd>
              <span>旋转</span>
            </div>
            <div class="control-item">
              <kbd>↓ / S</kbd>
              <span>软降</span>
            </div>
            <div class="control-item">
              <kbd>Space</kbd>
              <span>硬降</span>
            </div>
            <div class="control-item">
              <kbd>C</kbd>
              <span>暂存</span>
            </div>
            <div class="control-item">
              <kbd>P / Esc</kbd>
              <span>暂停</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="panel-box actions-box">
          <button
            v-if="!state.isRunning && state.isGameOver"
            class="btn btn-primary"
            @click="startGame"
          >
            重新开始
          </button>
          <button
            v-else-if="!state.isRunning && !state.isGameOver"
            class="btn btn-primary"
            @click="resumeGame"
          >
            继续
          </button>
          <button
            v-if="state.isRunning && !state.isGameOver"
            class="btn btn-secondary"
            @click="pauseGame"
          >
            暂停
          </button>
          <button
            v-if="state.isRunning || state.isGameOver"
            class="btn btn-accent"
            @click="startGame"
          >
            新游戏
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────── */

.game-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  min-height: 100vh;
}

.game-header {
  text-align: center;
  margin-bottom: 16px;
}

.game-title {
  font-size: 2.4rem;
  font-weight: 900;
  letter-spacing: 0.3em;
  background: linear-gradient(135deg, #00e5ff, #aa00ff, #ff1744);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  line-height: 1;
  animation: titleGlow 3s ease-in-out infinite;
}

.game-subtitle {
  font-size: 0.85rem;
  color: #666;
  letter-spacing: 0.2em;
  margin-top: 4px;
}

.game-layout {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

/* ── Side Panels ─────────────────────────────────────────────────────── */

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 140px;
}

.panel-box {
  background: #111128;
  border: 1px solid #1e1e3a;
  border-radius: 10px;
  padding: 12px 14px;
  animation: fadeIn 0.5s ease-out;
}

.panel-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: #555;
  letter-spacing: 0.15em;
  margin: 0 0 8px 0;
}

.score-value {
  font-size: 1.3rem;
  font-weight: 800;
  color: #00e5ff;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
}

.level-value {
  font-size: 1.5rem;
  font-weight: 900;
  color: #ffd600;
  text-shadow: 0 0 10px rgba(255, 214, 0, 0.5);
}

.lines-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #00e676;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 10px rgba(0, 230, 118, 0.5);
}

.combo-box {
  border-color: #ff1744;
  animation: comboPulse 0.5s ease-in-out;
}

.combo-value {
  font-size: 1.5rem;
  font-weight: 900;
  color: #ff1744;
  text-shadow: 0 0 15px rgba(255, 23, 68, 0.8);
  animation: comboBounce 0.3s ease-out;
}

/* ── Hold Grid ───────────────────────────────────────────────────────── */

.hold-grid {
  display: grid;
  grid-template-columns: repeat(4, 20px);
  grid-template-rows: repeat(4, 20px);
  gap: 2px;
  justify-content: center;
}

.hold-row {
  display: contents;
}

.hold-cell {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  background: #1a1a2e;
  border: 1px solid #222;
  transition: all 0.2s;
}

.hold-cell.filled {
  border-color: rgba(255, 255, 255, 0.3);
}

.hold-cell.dimmed {
  opacity: 0.4;
}

.hold-empty {
  font-size: 1.5rem;
  color: #333;
  text-align: center;
  padding: 16px 0;
}

/* ── Next Grid ───────────────────────────────────────────────────────── */

.next-grid {
  display: grid;
  grid-template-columns: repeat(4, 22px);
  grid-template-rows: repeat(4, 22px);
  gap: 2px;
  justify-content: center;
}

.next-row {
  display: contents;
}

.next-cell {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  background: #1a1a2e;
  border: 1px solid #222;
  transition: all 0.15s;
}

.next-cell.filled {
  border-color: rgba(255, 255, 255, 0.2);
}

.next-empty {
  font-size: 1.5rem;
  color: #333;
  text-align: center;
  padding: 16px 0;
}

/* ── Controls ────────────────────────────────────────────────────────── */

.controls-box {
  margin-top: auto;
}

.controls-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: #888;
}

kbd {
  display: inline-block;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 0.7rem;
  color: #aaa;
  min-width: 28px;
  text-align: center;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */

.actions-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.btn {
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.05em;
}

.btn-primary {
  background: linear-gradient(135deg, #00e5ff, #2979ff);
  color: #000;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 229, 255, 0.4);
}

.btn-secondary {
  background: #333;
  color: #fff;
}

.btn-secondary:hover {
  background: #444;
}

.btn-accent {
  background: linear-gradient(135deg, #ff1744, #ff9100);
  color: #fff;
}

.btn-accent:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(255, 23, 68, 0.4);
}

/* ── Board ───────────────────────────────────────────────────────────── */

.board-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
}

.board-container {
  --cell-size: 30px;
  --gap: 2px;
  --cols: 10;
  --rows: 20;
  position: relative;
  width: calc(var(--cols) * var(--cell-size) + (var(--cols) - 1) * var(--gap));
  height: calc(var(--rows) * var(--cell-size) + (var(--rows) - 1) * var(--gap));
  background: #0a0a1a;
  border: 2px solid #1e1e3a;
  border-radius: 8px;
  box-shadow: 0 0 40px rgba(0, 229, 255, 0.08),
    inset 0 0 30px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  /* Grid lines via background-image (no DOM nodes) */
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: calc(var(--cell-size) + var(--gap)) calc(var(--cell-size) + var(--gap));
}

.board-cells {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.board-row {
  display: flex;
  gap: var(--gap);
  flex: 1;
}

.board-cell {
  flex: 1;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.02);
  transition: background-color 0.06s;
}

.board-cell.filled {
  border-color: rgba(255, 255, 255, 0.15);
}

.board-cell.ghost {
  background: rgba(255, 255, 255, 0.06);
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

/* ── Particles ───────────────────────────────────────────────────────── */

.particles-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
  contain: strict; /* 隔离重绘区域 */
}

.particle {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 50%;
  pointer-events: none;
  will-change: transform, opacity; /* GPU 合成层 */
}

/* ── Clear Message ───────────────────────────────────────────────────── */

.clear-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  font-size: 2.5rem;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: #ffd600;
  text-shadow: 0 0 20px rgba(255, 214, 0, 0.8),
    0 0 40px rgba(255, 214, 0, 0.4);
  z-index: 20;
  pointer-events: none;
  animation: clearMessage 1.5s ease-out forwards;
}

.clear-message.tetris {
  font-size: 3rem;
  color: #ff1744;
  text-shadow: 0 0 30px rgba(255, 23, 68, 0.9),
    0 0 60px rgba(255, 23, 68, 0.5);
}

/* ── Overlays ────────────────────────────────────────────────────────── */

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
  border-radius: 6px;
}

.idle-overlay {
  background: rgba(10, 10, 26, 0.85);
  backdrop-filter: blur(4px);
}

.pause-overlay {
  background: rgba(10, 10, 26, 0.8);
  backdrop-filter: blur(3px);
}

.game-over-overlay {
  background: rgba(10, 10, 26, 0.9);
  backdrop-filter: blur(6px);
}

.overlay-content {
  text-align: center;
  animation: fadeInUp 0.4s ease-out;
}

.overlay-title {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: 0.2em;
  margin: 0 0 12px 0;
}

.game-over-overlay .overlay-title {
  color: #ff1744;
  text-shadow: 0 0 30px rgba(255, 23, 68, 0.6);
}

.idle-overlay .overlay-title {
  background: linear-gradient(135deg, #00e5ff, #aa00ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.pause-overlay .overlay-title {
  color: #ffd600;
  text-shadow: 0 0 20px rgba(255, 214, 0, 0.5);
}

.overlay-score {
  font-size: 1.1rem;
  color: #00e5ff;
  margin: 0 0 8px 0;
  font-weight: 600;
}

.overlay-stats {
  font-size: 0.9rem;
  color: #888;
  margin: 0 0 16px 0;
}

.overlay-hint {
  font-size: 0.85rem;
  color: #666;
  animation: pulse 2s ease-in-out infinite;
}

/* ── Animations ──────────────────────────────────────────────────────── */

@keyframes titleGlow {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.2);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

@keyframes clearMessage {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  20% {
    transform: translate(-50%, -50%) scale(1.3);
    opacity: 1;
  }
  40% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0;
  }
}

@keyframes comboPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

@keyframes comboBounce {
  0% {
    transform: scale(0.5);
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

/* ── Responsive ──────────────────────────────────────────────────────── */

@media (max-width: 768px) {
  .game-layout {
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .side-panel {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    min-width: unset;
    gap: 8px;
  }

  .side-panel .panel-box {
    flex: 1;
    min-width: 100px;
  }

  .controls-box,
  .actions-box {
    display: none;
  }

  .game-title {
    font-size: 1.8rem;
  }

  .board-container {
    --cell-size: 28px;
  }
}

@media (max-width: 480px) {
  .game-container {
    padding: 8px;
  }

  .game-title {
    font-size: 1.5rem;
  }

  .game-subtitle {
    font-size: 0.7rem;
  }

  .board-container {
    --cell-size: 26px;
  }
}
</style>
