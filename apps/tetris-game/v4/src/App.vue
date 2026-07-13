<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'

// ─── Constants ───────────────────────────────────────────────────────────────

const COLS = 10
const ROWS = 20
const EMPTY = 0

type PieceType = 'I' | 'O' | 'T' | 'L' | 'J' | 'S' | 'Z'
type Rotation = 0 | 1 | 2 | 3

interface PieceDef {
  shape: number[][]
  color: string
}

const PIECE_DEFS: Record<PieceType, PieceDef> = {
  I: {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: '#00e5ff',
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: '#ffd600',
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#aa00ff',
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#ff9100',
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#2979ff',
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: '#00e676',
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: '#ff1744',
  },
}

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'L', 'J', 'S', 'Z']

// ─── State ───────────────────────────────────────────────────────────────────

const board = reactive<number[][]>([])
const currentPiece = reactive({
  type: 'I' as PieceType,
  rotation: 0 as Rotation,
  x: 0,
  y: 0,
})
const nextPieceType = ref<PieceType>('I')
const score = ref(0)
const level = ref(1)
const lines = ref(0)
const gameOver = ref(false)
const gameStarted = ref(false)
const isPaused = ref(false)
const dropTimer = ref<ReturnType<typeof setInterval> | null>(null)

// ─── Computed ───────────────────────────────────────────────────────────────

const dropInterval = computed(() => {
  const base = 800
  const speed = Math.min(level.value * 80, 600)
  return Math.max(base - speed, 50)
})

const nextPiece = computed< PieceDef >(() => PIECE_DEFS[nextPieceType.value])

// ─── Helpers ────────────────────────────────────────────────────────────────

function createEmptyBoard(): number[][] {
  const b: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < COLS; c++) {
      row.push(EMPTY)
    }
    b.push(row)
  }
  return b
}

function getRandomPieceType(): PieceType {
  const idx = Math.floor(Math.random() * PIECE_TYPES.length)
  return PIECE_TYPES[idx]
}

function getCurrentShape(): number[][] {
  const def = PIECE_DEFS[currentPiece.type]
  const shape = def.shape
  const rot = currentPiece.rotation
  const n = shape.length
  const result: number[][] = []
  for (let r = 0; r < n; r++) {
    const row: number[] = []
    for (let c = 0; c < n; c++) {
      if (rot === 0) {
        row.push(shape[r][c])
      } else if (rot === 1) {
        row.push(shape[n - 1 - c][r])
      } else if (rot === 2) {
        row.push(shape[n - 1 - r][n - 1 - c])
      } else {
        row.push(shape[c][n - 1 - r])
      }
    }
    result.push(row)
  }
  return result
}

function isValidPosition(shape: number[][], px: number, py: number): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const boardRow = py + r
        const boardCol = px + c
        if (boardCol < 0 || boardCol >= COLS || boardRow >= ROWS) {
          return false
        }
        if (boardRow >= 0 && board[boardRow][boardCol] !== EMPTY) {
          return false
        }
      }
    }
  }
  return true
}

function lockPiece(): void {
  const shape = getCurrentShape()
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const boardRow = currentPiece.y + r
        const boardCol = currentPiece.x + c
        if (boardRow < 0) {
          gameOver.value = true
          if (dropTimer.value) {
            clearInterval(dropTimer.value)
            dropTimer.value = null
          }
          return
        }
        board[boardRow][boardCol] = currentPiece.rotation + 1
      }
    }
  }
  clearLines()
  spawnPiece()
}

function clearLines(): void {
  let cleared = 0
  for (let r = ROWS - 1; r >= 0; r--) {
    let full = true
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === EMPTY) {
        full = false
        break
      }
    }
    if (full) {
      board.splice(r, 1)
      const newRow: number[] = []
      for (let c = 0; c < COLS; c++) {
        newRow.push(EMPTY)
      }
      board.unshift(newRow)
      cleared++
      r++
    }
  }
  if (cleared > 0) {
    const lineScores = [0, 100, 300, 500, 800]
    score.value += lineScores[cleared] * level.value
    lines.value += cleared
    level.value = Math.floor(lines.value / 10) + 1
  }
}

function spawnPiece(): void {
  currentPiece.type = nextPieceType.value
  currentPiece.rotation = 0
  const shape = getCurrentShape()
  currentPiece.x = Math.floor((COLS - shape[0].length) / 2)
  currentPiece.y = -1
  nextPieceType.value = getRandomPieceType()

  if (!isValidPosition(shape, currentPiece.x, currentPiece.y + 1)) {
    // Try to place at y=0 instead
    currentPiece.y = 0
    if (!isValidPosition(shape, currentPiece.x, currentPiece.y)) {
      gameOver.value = true
      if (dropTimer.value) {
        clearInterval(dropTimer.value)
        dropTimer.value = null
      }
    }
  }
}

function moveLeft(): void {
  if (gameOver.value || !gameStarted.value || isPaused.value) return
  const shape = getCurrentShape()
  if (isValidPosition(shape, currentPiece.x - 1, currentPiece.y)) {
    currentPiece.x--
  }
}

function moveRight(): void {
  if (gameOver.value || !gameStarted.value || isPaused.value) return
  const shape = getCurrentShape()
  if (isValidPosition(shape, currentPiece.x + 1, currentPiece.y)) {
    currentPiece.x++
  }
}

function moveDown(): void {
  if (gameOver.value || !gameStarted.value || isPaused.value) return
  const shape = getCurrentShape()
  if (isValidPosition(shape, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y++
  } else {
    lockPiece()
  }
}

function rotate(): void {
  if (gameOver.value || !gameStarted.value || isPaused.value) return
  const newRotation: Rotation = ((currentPiece.rotation + 1) % 4) as Rotation
  const prevRotation = currentPiece.rotation
  currentPiece.rotation = newRotation
  const shape = getCurrentShape()
  // Wall kick offsets
  const kicks = [0, -1, 1, -2, 2]
  for (const kick of kicks) {
    if (isValidPosition(shape, currentPiece.x + kick, currentPiece.y)) {
      currentPiece.x += kick
      return
    }
  }
  // Revert if no valid position
  currentPiece.rotation = prevRotation
}

function hardDrop(): void {
  if (gameOver.value || !gameStarted.value || isPaused.value) return
  const shape = getCurrentShape()
  while (isValidPosition(shape, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y++
  }
  lockPiece()
}

function startGame(): void {
  board.splice(0, board.length, ...createEmptyBoard())
  score.value = 0
  level.value = 1
  lines.value = 0
  gameOver.value = false
  gameStarted.value = true
  isPaused.value = false
  nextPieceType.value = getRandomPieceType()
  spawnPiece()
  startDropTimer()
}

function togglePause(): void {
  if (!gameStarted.value || gameOver.value) return
  isPaused.value = !isPaused.value
  if (isPaused.value) {
    if (dropTimer.value) {
      clearInterval(dropTimer.value)
      dropTimer.value = null
    }
  } else {
    startDropTimer()
  }
}

function startDropTimer(): void {
  if (dropTimer.value) {
    clearInterval(dropTimer.value)
  }
  dropTimer.value = setInterval(() => {
    moveDown()
  }, dropInterval.value)
}

// ─── Grid rendering with active piece overlay ───────────────────────────────

const displayGrid = computed(() => {
  const grid: { color: string; active: boolean }[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: { color: string; active: boolean }[] = []
    for (let c = 0; c < COLS; c++) {
      row.push({ color: 'transparent', active: false })
    }
    grid.push(row)
  }

  // Locked pieces
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== EMPTY) {
        const rotationIndex = board[r][c] - 1
        const pieceTypes = Object.keys(PIECE_DEFS) as PieceType[]
        const type = pieceTypes[rotationIndex % pieceTypes.length]
        grid[r][c] = { color: PIECE_DEFS[type].color, active: false }
      }
    }
  }

  // Active piece
  if (gameStarted.value && !gameOver.value) {
    const shape = getCurrentShape()
    const def = PIECE_DEFS[currentPiece.type]
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const br = currentPiece.y + r
          const bc = currentPiece.x + c
          if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
            grid[br][bc] = { color: def.color, active: true }
          }
        }
      }
    }
  }

  return grid
})

// ─── Keyboard events ─────────────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent): void {
  if (!gameStarted.value || gameOver.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      startGame()
    }
    return
  }

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      moveLeft()
      break
    case 'ArrowRight':
      e.preventDefault()
      moveRight()
      break
    case 'ArrowDown':
      e.preventDefault()
      moveDown()
      break
    case 'ArrowUp':
      e.preventDefault()
      rotate()
      break
    case ' ':
      e.preventDefault()
      hardDrop()
      break
    case 'p':
    case 'P':
      e.preventDefault()
      togglePause()
      break
  }
}

// ─── Touch Controls ─────────────────────────────────────────────────────────

const touchStartX = ref(0)
const touchStartY = ref(0)
const touchStartTime = ref(0)

function handleTouchStart(e: TouchEvent): void {
  if (isPaused.value) return
  if (!gameStarted.value || gameOver.value) return
  const touch = e.touches[0]
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
  touchStartTime.value = Date.now()
}

function handleTouchEnd(e: TouchEvent): void {
  if (isPaused.value) return
  if (!gameStarted.value || gameOver.value) return
  const touch = e.changedTouches[0]
  const dx = touch.clientX - touchStartX.value
  const dy = touch.clientY - touchStartY.value
  const dt = Date.now() - touchStartTime.value

  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (absDx < 30 && absDy < 30 && dt < 200) {
    // Tap - rotate
    rotate()
  } else if (absDx > absDy) {
    // Horizontal swipe
    if (dx > 0) moveRight()
    else moveLeft()
  } else if (dy > absDx && dy > 50) {
    // Down swipe - hard drop
    hardDrop()
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('touchstart', handleTouchStart, { passive: true })
  window.addEventListener('touchend', handleTouchEnd)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('touchstart', handleTouchStart)
  window.removeEventListener('touchend', handleTouchEnd)
  if (dropTimer.value) {
    clearInterval(dropTimer.value)
    dropTimer.value = null
  }
})

// Restart drop timer when speed changes (level up)
watch(dropInterval, () => {
  if (gameStarted.value && !gameOver.value && !isPaused.value) {
    startDropTimer()
  }
})
</script>

<template>
  <div class="game-container">
    <div class="game-header">
      <h1 class="game-title">TETRIS</h1>
      <p class="game-subtitle">俄罗斯方块</p>
    </div>

    <div class="game-layout">
      <!-- Game Board -->
      <div class="board-wrapper">
        <div v-if="!gameStarted" class="start-screen">
          <div class="start-content">
            <h2>TETRIS</h2>
            <p class="instructions">
              按 <kbd>←</kbd> <kbd>→</kbd> 移动<br/>
              按 <kbd>↑</kbd> 旋转<br/>
              按 <kbd>↓</kbd> 加速下落<br/>
              按 <kbd>空格</kbd> 直接落底<br/>
              按 <kbd>P</kbd> 暂停
            </p>
            <button class="start-btn" @click="startGame">开始游戏</button>
          </div>
        </div>
        <div v-else-if="gameOver" class="game-over-screen">
          <h2>游戏结束</h2>
          <p class="final-score">最终得分: {{ score }}</p>
          <button class="start-btn" @click="startGame">重新开始</button>
        </div>
        <div v-else class="board" :class="{ 'board-active': gameStarted && !gameOver }">
          <div
            v-for="(row, rowIndex) in displayGrid"
            :key="rowIndex"
            class="board-row"
          >
            <div
              v-for="(cell, colIndex) in row"
              :key="colIndex"
              class="cell"
              :class="{
                'cell-filled': cell.color !== 'transparent',
                'cell-active': cell.active,
              }"
              :style="{
                backgroundColor: cell.color,
                boxShadow: cell.active ? '0 0 6px ' + cell.color : 'none',
              }"
            />
          </div>
          <div v-if="isPaused" class="pause-indicator">已暂停 (PAUSED)</div>
        </div>
        <div v-if="gameStarted && !gameOver && isPaused" class="pause-overlay">
          <h2>已暂停</h2>
          <button class="start-btn" @click="togglePause">继续 (P)</button>
        </div>
      </div>

      <!-- Side Panel -->
      <div class="side-panel">
        <div class="panel-section">
          <h3>下一个</h3>
          <div class="next-piece-display">
            <div class="next-grid">
              <div
                v-for="(row, r) in nextPiece.shape"
                :key="r"
                class="next-row"
              >
                <div
                  v-for="(cell, c) in row"
                  :key="c"
                  class="next-cell"
                  :style="{
                    backgroundColor: cell ? nextPiece.color : 'transparent',
                    boxShadow: cell ? '0 0 4px ' + nextPiece.color : 'none',
                  }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="panel-section">
          <h3>得分</h3>
          <p class="score-value">{{ score }}</p>
        </div>

        <div class="panel-section">
          <h3>等级</h3>
          <p class="level-value">{{ level }}</p>
        </div>

        <div class="panel-section">
          <h3>消除行数</h3>
          <p class="lines-value">{{ lines }}</p>
        </div>

        <div class="panel-section controls-section">
          <h3>操作</h3>
          <div class="control-buttons">
            <button class="ctrl-btn" @click="moveLeft" title="左移">◀</button>
            <button class="ctrl-btn" @click="moveRight" title="右移">▶</button>
            <button class="ctrl-btn" @click="rotate" title="旋转">↻</button>
            <button class="ctrl-btn" @click="moveDown" title="下移">▼</button>
            <button class="ctrl-btn" @click="hardDrop" title="落底">⏬</button>
            <button class="ctrl-btn pause-btn" @click="togglePause" title="暂停">
              {{ isPaused ? '▶' : '⏸' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Mitosis Continuation -->
    <div class="mitosis-link">
      <a
        href="https://mitosis.zenheart.site?ref=tetris-game"
        target="_blank"
        rel="noopener noreferrer"
        class="mitosis-btn"
      >
        🧬 在 Mitosis 中继续迭代
      </a>
      <span class="mitosis-desc">这是由 AI 构建的应用。登录后可以在此基础上继续迭代。</span>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  min-height: 100dvh;
}

.game-header {
  text-align: center;
  margin-bottom: 20px;
}

.game-title {
  font-size: 2.5rem;
  font-weight: 900;
  background: linear-gradient(135deg, #00e5ff, #aa00ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.3em;
  margin: 0;
}

.game-subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 4px;
  letter-spacing: 0.2em;
}

.game-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
}

.board-wrapper {
  position: relative;
  flex-shrink: 0;
}

.board {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  padding: 4px;
  gap: 2px;
}

.board-row {
  display: flex;
  gap: 2px;
}

.cell {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  background: var(--bg-panel);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: background-color 0.05s ease;
}

.cell-filled {
  border-color: rgba(255, 255, 255, 0.18);
}

.cell-active {
  z-index: 1;
}

.pause-indicator {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 1.2rem;
  font-weight: 700;
  border-radius: 8px;
  pointer-events: none;
}

.pause-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  text-align: center;
  padding: 20px;
  gap: 16px;
}

/* Start Screen */
.start-screen,
.game-over-screen {
  width: calc(24px * 10 + 2px * 9 + 8px);
  height: calc(24px * 20 + 2px * 19 + 8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  text-align: center;
  padding: 20px;
}

.start-content h2,
.game-over-screen h2,
.pause-overlay h2 {
  font-size: 2rem;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #00e5ff, #aa00ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.instructions {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.8;
}

.instructions kbd {
  display: inline-block;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: 0.8rem;
  color: var(--accent-cyan);
  margin: 0 2px;
}

.final-score {
  font-size: 1.2rem;
  color: var(--accent-yellow);
  margin-bottom: 20px;
}

.start-btn {
  padding: 12px 32px;
  font-size: 1.1rem;
  font-weight: 700;
  background: linear-gradient(135deg, #00e5ff, #aa00ff);
  color: #000;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.start-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.3);
}

.start-btn:active {
  transform: scale(0.98);
}

/* Side Panel */
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 120px;
}

.panel-section {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
}

.panel-section h3 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.score-value,
.level-value,
.lines-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent-cyan);
  margin: 0;
}

/* Next piece */
.next-piece-display {
  display: flex;
  justify-content: center;
}

.next-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.next-row {
  display: flex;
  gap: 2px;
}

.next-cell {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}

/* Controls */
.controls-section {
  padding: 12px 8px;
}

.control-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  justify-items: center;
}

.ctrl-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  transition: background 0.1s, transform 0.1s;
}

.ctrl-btn:hover {
  background: var(--border-color);
}

.ctrl-btn:active {
  transform: scale(0.92);
}

.pause-btn {
  grid-column: 2;
}

/* Mitosis link */
.mitosis-link {
  margin-top: 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.mitosis-btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 8px 20px;
  font-size: 0.85rem;
  background: transparent;
  color: var(--accent-purple);
  border: 1px solid var(--accent-purple);
  border-radius: 20px;
  text-decoration: none;
  transition: background 0.2s, color 0.2s;
}

.mitosis-btn:hover {
  background: var(--accent-purple);
  color: #fff;
}

.mitosis-desc {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

/* Responsive */
@media (max-width: 500px) {
  .game-container {
    --mobile-cell-size: clamp(
      14px,
      min(calc((100vw - 72px) / 10), calc((100dvh - 380px) / 20)),
      24px
    );
    min-height: 100vh;
    min-height: 100dvh;
    padding: 8px;
  }

  .game-header {
    margin-bottom: 8px;
  }

  .game-title {
    font-size: 1.5rem;
  }

  .game-layout {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .side-panel {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .panel-section {
    min-width: 0;
    padding: 6px;
    text-align: center;
  }

  .panel-section h3 {
    margin-bottom: 4px;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
  }

  .score-value,
  .level-value,
  .lines-value {
    font-size: 1rem;
  }

  .next-cell {
    width: 12px;
    height: 12px;
  }

  .controls-section {
    grid-column: 1 / -1;
    padding: 6px;
  }

  .control-buttons {
    grid-template-columns: repeat(6, 44px);
    gap: 6px;
    justify-content: center;
  }

  .ctrl-btn {
    width: 44px;
    height: 44px;
  }

  .pause-btn {
    grid-column: auto;
  }

  .cell {
    width: var(--mobile-cell-size);
    height: var(--mobile-cell-size);
  }

  .start-screen,
  .game-over-screen {
    width: calc(var(--mobile-cell-size) * 10 + 2px * 9 + 8px);
    height: calc(var(--mobile-cell-size) * 20 + 2px * 19 + 8px);
    padding: 12px;
  }

  .mitosis-link {
    margin-top: 12px;
  }
}
</style>
