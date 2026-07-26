<template>
  <div class="game-shell">
    <div class="wood-grain" aria-hidden="true"></div>

    <header class="masthead">
      <div class="brand">
        <span class="brand-seal" aria-hidden="true">Mộc</span>
        <div>
          <p class="eyebrow">Trò chơi dân gian trực tuyến</p>
          <h1>Cờ Mộc</h1>
          <p class="brand-subtitle">Bàn cờ vô hạn · Năm quân liền nhau là thắng</p>
        </div>
      </div>

      <div class="connection-pill" :class="{ online: isConnected }">
        <span aria-hidden="true"></span>
        {{ isConnected ? 'Đã nối bàn cờ' : 'Đang tìm máy chủ' }}
      </div>
    </header>

    <main class="parchment-card">
      <Transition name="paper-fade" mode="out-in">
        <section v-if="!playerSymbol" key="lobby" class="lobby">
          <div class="folk-divider" aria-hidden="true"><i></i><b>✦</b><i></i></div>
          <p class="section-kicker">Mời bạn vào chiếu</p>
          <h2>Một căn phòng, hai người chơi</h2>
          <p class="lobby-copy">
            Tạo mã phòng mới hoặc nhập mã của bạn bè. Quân
            <strong class="text-x">X đỏ son</strong> đi trước, quân
            <strong class="text-o">O xanh biển</strong> đi sau.
          </p>

          <div class="room-form">
            <label for="room-id">Mã phòng</label>
            <div class="room-input-row">
              <input
                id="room-id"
                v-model="roomId"
                maxlength="32"
                autocomplete="off"
                placeholder="Ví dụ: LANG-QUE"
                :disabled="!isConnected || isJoining"
                @keyup.enter="joinGame"
              />
              <button class="primary-button" :disabled="!canJoin" @click="joinGame">
                {{ isJoining ? 'Đang vào...' : 'Vào phòng' }}
              </button>
            </div>
            <p>Chỉ dùng chữ, số, dấu gạch ngang hoặc gạch dưới.</p>
          </div>

          <button class="new-room-button" :disabled="!isConnected || isJoining" @click="createRoom">
            <span aria-hidden="true">＋</span>
            Tạo phòng mới
          </button>

          <div class="simple-rules">
            <div>
              <span>1</span>
              <p><strong>Rủ một người bạn</strong><small>Gửi mã phòng để cùng vào bàn.</small></p>
            </div>
            <div>
              <span>2</span>
              <p>
                <strong>Đặt quân luân phiên</strong
                ><small>Cuộn bàn cờ để đi đến bất kỳ tọa độ nào.</small>
              </p>
            </div>
            <div>
              <span>3</span>
              <p>
                <strong>Nối đủ năm quân</strong><small>Ngang, dọc hoặc chéo đều được tính.</small>
              </p>
            </div>
          </div>
        </section>

        <section v-else key="game" class="play-layout">
          <aside class="game-sidebar">
            <div class="room-plaque">
              <span>Phòng đang chơi</span>
              <strong>{{ joinedRoomId }}</strong>
              <button @click="copyRoomCode">
                {{ copied ? 'Đã chép mã' : 'Chép mã phòng' }}
              </button>
            </div>

            <div class="players-panel">
              <p class="panel-label">Hai bên</p>
              <div class="player-row" :class="{ active: currentPlayer === 'X' && !winner }">
                <span class="piece piece-x">X</span>
                <div>
                  <strong>Quân đỏ son</strong
                  ><small>{{ players.X ? 'Đã vào bàn' : 'Đang chờ' }}</small>
                </div>
                <em v-if="playerSymbol === 'X'">Bạn</em>
              </div>
              <div class="player-row" :class="{ active: currentPlayer === 'O' && !winner }">
                <span class="piece piece-o">O</span>
                <div>
                  <strong>Quân xanh biển</strong
                  ><small>{{ players.O ? 'Đã vào bàn' : 'Đang chờ' }}</small>
                </div>
                <em v-if="playerSymbol === 'O'">Bạn</em>
              </div>
            </div>

            <div class="match-notes">
              <p>
                <span>{{ moveCount }}</span> nước đã đi
              </p>
              <p>
                <span>{{ viewportCenter.row }}, {{ viewportCenter.col }}</span> tâm khung nhìn
              </p>
            </div>

            <div class="sidebar-actions">
              <button v-if="winner" class="primary-button" @click="resetGame">Chơi ván mới</button>
              <button class="quiet-button" @click="leaveGame">Rời chiếu</button>
            </div>
          </aside>

          <section class="board-section">
            <div class="turn-banner" :class="{ victory: winner }" aria-live="polite">
              <span
                class="turn-symbol"
                :class="
                  winner === 'O' || (!winner && currentPlayer === 'O') ? 'piece-o' : 'piece-x'
                "
              >
                {{ winner ?? currentPlayer }}
              </span>
              <div>
                <small>{{ winner ? 'Ván cờ đã định' : 'Tình hình trên chiếu' }}</small>
                <strong>{{ status }}</strong>
              </div>
            </div>

            <Transition name="notice">
              <div v-if="notice" class="notice" role="status">{{ notice }}</div>
            </Transition>

            <div class="board-toolbar">
              <div>
                <strong>Bàn cờ vô hạn</strong>
                <small>Cuộn để khám phá · Chạm ô kem để đặt quân</small>
              </div>
              <div class="toolbar-actions">
                <button @click="centerBoard(0, 0)">Về tâm</button>
                <button :disabled="!lastMove" @click="centerLatestMove">Nước mới nhất</button>
              </div>
            </div>

            <div class="board-frame">
              <span class="corner corner-a" aria-hidden="true"></span>
              <span class="corner corner-b" aria-hidden="true"></span>
              <span class="corner corner-c" aria-hidden="true"></span>
              <span class="corner corner-d" aria-hidden="true"></span>

              <div
                ref="boardViewport"
                class="board-viewport"
                aria-label="Bàn cờ vô hạn"
                @scroll="handleBoardScroll"
              >
                <div class="infinite-grid" :style="boardGridStyle" role="grid">
                  <button
                    v-for="cell in visibleCells"
                    :key="cell.key"
                    class="board-cell"
                    :class="{
                      occupied: Boolean(cell.value),
                      'cell-x': cell.value === 'X',
                      'cell-o': cell.value === 'O',
                      latest: lastMoveKey === cell.key,
                      winning: winningCellSet.has(cell.key),
                    }"
                    :disabled="!canPlaceAt(cell.key)"
                    :aria-label="cellAriaLabel(cell)"
                    role="gridcell"
                    @click="makeMove(cell.row, cell.col)"
                  >
                    <span>{{ cell.value }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="board-navigation" aria-label="Điều hướng bàn cờ">
              <span>Di chuyển khung nhìn</span>
              <div class="direction-pad">
                <button aria-label="Lên trên" @click="panBoard(-1, 0)">↑</button>
                <button aria-label="Sang trái" @click="panBoard(0, -1)">←</button>
                <button aria-label="Về nước mới nhất" @click="centerLatestMove">◎</button>
                <button aria-label="Sang phải" @click="panBoard(0, 1)">→</button>
                <button aria-label="Xuống dưới" @click="panBoard(1, 0)">↓</button>
              </div>
            </div>
          </section>
        </section>
      </Transition>
    </main>

    <footer>
      <span>✦</span>
      Cờ Mộc · Chơi chậm một nhịp, gần nhau thêm một chút
      <span>✦</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { io, type Socket } from 'socket.io-client'

type PlayerSymbol = 'X' | 'O'
type SparseBoard = Record<string, PlayerSymbol>

interface BoardMove {
  row: number
  col: number
  player: PlayerSymbol
}

interface GameState {
  board: SparseBoard
  currentPlayer: PlayerSymbol
  players: Partial<Record<PlayerSymbol, string>>
  winner: PlayerSymbol | null
  lastMove: BoardMove | null
  winningCells: string[]
  moveCount: number
  playerCount: number
}

interface VisibleCell {
  row: number
  col: number
  key: string
  value?: PlayerSymbol
}

const GRID_SIZE = 35
const GRID_CENTER = Math.floor(GRID_SIZE / 2)
const CELL_SIZE = 44
const EDGE_CELLS = 6
const SHIFT_CELLS = 10
const PAN_CELLS = 7
const ROOM_ID_PATTERN = /^[\p{L}\p{N}_-]{1,32}$/u

const roomId = ref('')
const joinedRoomId = ref('')
const board = ref<SparseBoard>({})
const currentPlayer = ref<PlayerSymbol>('X')
const playerSymbol = ref<PlayerSymbol | null>(null)
const players = ref<Partial<Record<PlayerSymbol, string>>>({})
const winner = ref<PlayerSymbol | null>(null)
const lastMove = ref<BoardMove | null>(null)
const winningCells = ref<string[]>([])
const moveCount = ref(0)
const playerCount = ref(0)
const isConnected = ref(false)
const isJoining = ref(false)
const notice = ref('')
const copied = ref(false)
const boardViewport = ref<HTMLDivElement | null>(null)
const originRow = ref(-GRID_CENTER)
const originCol = ref(-GRID_CENTER)
const viewportCenter = ref({ row: 0, col: 0 })

let socket: Socket | null = null
let noticeTimer = 0
let adjustingViewport = false
let renderedLastMoveKey = ''

const keyFor = (row: number, col: number) => `${row},${col}`

const canJoin = computed(
  () => isConnected.value && !isJoining.value && ROOM_ID_PATTERN.test(roomId.value.trim()),
)

const isMyTurn = computed(
  () => playerSymbol.value === currentPlayer.value && playerCount.value === 2,
)

const status = computed(() => {
  if (!isConnected.value) return 'Mất kết nối, đang thử nối lại...'
  if (winner.value) {
    return winner.value === playerSymbol.value
      ? 'Bạn đã nối đủ năm quân!'
      : `Quân ${winner.value} đã nối đủ năm quân.`
  }
  if (playerCount.value < 2) return 'Đang chờ người chơi thứ hai...'
  if (isMyTurn.value) return `Đến lượt bạn đặt quân ${playerSymbol.value}.`
  return `Đang chờ quân ${currentPlayer.value} của đối thủ.`
})

const visibleCells = computed<VisibleCell[]>(() =>
  Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
    const row = originRow.value + Math.floor(index / GRID_SIZE)
    const col = originCol.value + (index % GRID_SIZE)
    const key = keyFor(row, col)
    return { row, col, key, value: board.value[key] }
  }),
)

const boardGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
  gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
}))

const winningCellSet = computed(() => new Set(winningCells.value))
const lastMoveKey = computed(() =>
  lastMove.value ? keyFor(lastMove.value.row, lastMove.value.col) : '',
)

const showNotice = (message: string) => {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 3600)
}

const resetLocalBoard = () => {
  board.value = {}
  currentPlayer.value = 'X'
  players.value = {}
  winner.value = null
  lastMove.value = null
  winningCells.value = []
  moveCount.value = 0
  playerCount.value = 0
  renderedLastMoveKey = ''
}

const joinGame = () => {
  const normalizedRoomId = roomId.value.trim()
  if (!socket || !ROOM_ID_PATTERN.test(normalizedRoomId)) {
    showNotice('Mã phòng chưa đúng định dạng.')
    return
  }
  isJoining.value = true
  roomId.value = normalizedRoomId
  socket.emit('joinGame', { roomId: normalizedRoomId })
}

const createRoom = () => {
  const randomPart = crypto
    .getRandomValues(new Uint32Array(1))[0]
    .toString(36)
    .slice(0, 6)
    .toUpperCase()
  roomId.value = `MOC-${randomPart}`
  joinGame()
}

const makeMove = (row: number, col: number) => {
  const key = keyFor(row, col)
  if (!socket || !canPlaceAt(key)) return
  socket.emit('makeMove', { roomId: joinedRoomId.value, row, col })
}

const canPlaceAt = (key: string) =>
  isConnected.value && isMyTurn.value && !winner.value && !board.value[key]

const resetGame = () => {
  socket?.emit('resetGame', { roomId: joinedRoomId.value })
}

const leaveGame = () => {
  if (socket && isConnected.value && joinedRoomId.value) {
    socket.emit('leaveGame', { roomId: joinedRoomId.value })
  }
  joinedRoomId.value = ''
  playerSymbol.value = null
  isJoining.value = false
  resetLocalBoard()
}

const copyRoomCode = async () => {
  try {
    await navigator.clipboard.writeText(joinedRoomId.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1800)
  } catch {
    showNotice(`Mã phòng: ${joinedRoomId.value}`)
  }
}

const cellAriaLabel = (cell: VisibleCell) =>
  cell.value
    ? `Ô hàng ${cell.row}, cột ${cell.col}, quân ${cell.value}`
    : `Đặt quân tại hàng ${cell.row}, cột ${cell.col}`

const updateViewportCenter = () => {
  const viewport = boardViewport.value
  if (!viewport) return
  viewportCenter.value = {
    row: originRow.value + Math.floor((viewport.scrollTop + viewport.clientHeight / 2) / CELL_SIZE),
    col: originCol.value + Math.floor((viewport.scrollLeft + viewport.clientWidth / 2) / CELL_SIZE),
  }
}

const centerBoard = (row: number, col: number) => {
  originRow.value = row - GRID_CENTER
  originCol.value = col - GRID_CENTER
  adjustingViewport = true
  void nextTick(() => {
    const viewport = boardViewport.value
    if (!viewport) return
    viewport.scrollTop = GRID_CENTER * CELL_SIZE - viewport.clientHeight / 2 + CELL_SIZE / 2
    viewport.scrollLeft = GRID_CENTER * CELL_SIZE - viewport.clientWidth / 2 + CELL_SIZE / 2
    updateViewportCenter()
    window.requestAnimationFrame(() => {
      adjustingViewport = false
    })
  })
}

const centerLatestMove = () => {
  const target = lastMove.value ?? { row: 0, col: 0 }
  centerBoard(target.row, target.col)
}

const panBoard = (rowDirection: number, colDirection: number) => {
  boardViewport.value?.scrollBy({
    top: rowDirection * PAN_CELLS * CELL_SIZE,
    left: colDirection * PAN_CELLS * CELL_SIZE,
    behavior: 'smooth',
  })
}

const shiftInfiniteGrid = (rowShift: number, colShift: number) => {
  const viewport = boardViewport.value
  if (!viewport || (!rowShift && !colShift)) return

  const previousTop = viewport.scrollTop
  const previousLeft = viewport.scrollLeft
  adjustingViewport = true
  originRow.value += rowShift
  originCol.value += colShift

  void nextTick(() => {
    viewport.scrollTop = previousTop - rowShift * CELL_SIZE
    viewport.scrollLeft = previousLeft - colShift * CELL_SIZE
    updateViewportCenter()
    window.requestAnimationFrame(() => {
      adjustingViewport = false
    })
  })
}

const handleBoardScroll = () => {
  const viewport = boardViewport.value
  if (!viewport) return
  updateViewportCenter()
  if (adjustingViewport) return

  const edge = EDGE_CELLS * CELL_SIZE
  let rowShift = 0
  let colShift = 0
  if (viewport.scrollTop < edge) rowShift = -SHIFT_CELLS
  else if (viewport.scrollTop + viewport.clientHeight > viewport.scrollHeight - edge) {
    rowShift = SHIFT_CELLS
  }
  if (viewport.scrollLeft < edge) colShift = -SHIFT_CELLS
  else if (viewport.scrollLeft + viewport.clientWidth > viewport.scrollWidth - edge) {
    colShift = SHIFT_CELLS
  }

  shiftInfiniteGrid(rowShift, colShift)
}

const applyGameState = (payload: GameState) => {
  board.value = payload.board
  currentPlayer.value = payload.currentPlayer
  players.value = payload.players
  winner.value = payload.winner
  lastMove.value = payload.lastMove
  winningCells.value = payload.winningCells
  moveCount.value = payload.moveCount
  playerCount.value = payload.playerCount

  const nextMoveKey = payload.lastMove ? keyFor(payload.lastMove.row, payload.lastMove.col) : ''
  if (nextMoveKey && nextMoveKey !== renderedLastMoveKey) {
    renderedLastMoveKey = nextMoveKey
    void nextTick(centerLatestMove)
  } else if (!nextMoveKey && renderedLastMoveKey) {
    renderedLastMoveKey = ''
    void nextTick(() => centerBoard(0, 0))
  }
}

const initSocket = () => {
  const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'https://tictactoe-backend-ixk9.onrender.com'
  socket = io(socketUrl, { transports: ['websocket'] })

  socket.on('connect', () => {
    isConnected.value = true
    if (joinedRoomId.value) {
      isJoining.value = true
      socket?.emit('joinGame', { roomId: joinedRoomId.value })
    }
  })

  socket.on('disconnect', () => {
    isConnected.value = false
    isJoining.value = false
    if (joinedRoomId.value) {
      showNotice('Kết nối bị gián đoạn. Trò chơi sẽ tự vào lại khi có mạng.')
    }
  })

  socket.on('playerAssigned', (payload: { playerSymbol: PlayerSymbol; playerCount: number }) => {
    playerSymbol.value = payload.playerSymbol
    playerCount.value = payload.playerCount
    joinedRoomId.value = roomId.value
    isJoining.value = false
    void nextTick(() => centerBoard(0, 0))
  })

  socket.on('gameState', applyGameState)
  socket.on('playerCountUpdate', (payload: { playerCount: number }) => {
    playerCount.value = payload.playerCount
  })
  socket.on('gameOver', (payload: { winner: PlayerSymbol | null; winningCells?: string[] }) => {
    winner.value = payload.winner
    winningCells.value = payload.winningCells ?? []
  })
  socket.on('gameNotice', (payload: { message: string }) => {
    showNotice(payload.message)
  })
  socket.on('gameError', (payload: { message: string }) => {
    isJoining.value = false
    showNotice(payload.message)
  })
}

onMounted(() => {
  initSocket()
})
</script>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 320px;
  background: #4b2d1d;
}

:global(button),
:global(input) {
  font: inherit;
}

.game-shell {
  --ink: #35271f;
  --muted: #775f4e;
  --paper: #f5e8c9;
  --paper-deep: #ead3a4;
  --wood: #6d4128;
  --wood-dark: #3e2418;
  --line: #b88952;
  --red: #b33932;
  --blue: #216d8f;
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: 28px;
  color: var(--ink);
  font-family: 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
  background:
    linear-gradient(
      90deg,
      rgba(30, 14, 7, 0.2),
      transparent 18%,
      rgba(255, 225, 177, 0.08) 50%,
      transparent 82%,
      rgba(30, 14, 7, 0.22)
    ),
    repeating-linear-gradient(3deg, #56321f 0 10px, #633b25 11px 22px, #4e2d1c 23px 33px);
}

.wood-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.55;
  background:
    radial-gradient(
      ellipse at 16% 24%,
      transparent 0 28px,
      rgba(35, 16, 8, 0.35) 29px 32px,
      transparent 33px 48px
    ),
    radial-gradient(
      ellipse at 78% 72%,
      transparent 0 45px,
      rgba(35, 16, 8, 0.3) 46px 49px,
      transparent 50px 72px
    ),
    repeating-linear-gradient(92deg, transparent 0 84px, rgba(255, 220, 165, 0.035) 85px 87px);
}

.masthead,
.parchment-card,
footer {
  position: relative;
  z-index: 1;
  width: min(1180px, 100%);
  margin-inline: auto;
}

.masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
  color: #fff3d4;
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-seal {
  display: grid;
  width: 66px;
  height: 66px;
  flex: 0 0 auto;
  place-items: center;
  border: 2px solid #e8bf76;
  outline: 1px solid rgba(255, 239, 198, 0.32);
  outline-offset: -7px;
  border-radius: 50% 46% 52% 44%;
  color: #ffe6a9;
  font-size: 21px;
  font-weight: 800;
  transform: rotate(-3deg);
  background: #8f3329;
  box-shadow: 0 8px 22px rgba(28, 12, 6, 0.28);
}

.eyebrow,
.section-kicker,
.panel-label {
  margin: 0;
  color: #e4bb77;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.brand h1 {
  margin: 1px 0 0;
  font-size: clamp(32px, 5vw, 48px);
  line-height: 0.95;
  letter-spacing: 0.04em;
}

.brand-subtitle {
  margin: 7px 0 0;
  color: rgba(255, 243, 212, 0.72);
  font-size: 14px;
}

.connection-pill {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid rgba(255, 237, 202, 0.25);
  border-radius: 999px;
  padding: 9px 14px;
  color: rgba(255, 243, 212, 0.74);
  font-size: 13px;
  background: rgba(35, 18, 10, 0.34);
}

.connection-pill span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c56c54;
  box-shadow: 0 0 0 4px rgba(197, 108, 84, 0.14);
}

.connection-pill.online span {
  background: #8fac79;
  box-shadow: 0 0 0 4px rgba(143, 172, 121, 0.16);
}

.parchment-card {
  min-height: 680px;
  overflow: hidden;
  border: 1px solid rgba(255, 232, 183, 0.6);
  border-radius: 18px;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, 0.38), transparent 34%),
    repeating-linear-gradient(0deg, rgba(119, 79, 37, 0.018) 0 1px, transparent 1px 5px),
    var(--paper);
  box-shadow:
    0 22px 55px rgba(28, 13, 7, 0.38),
    inset 0 0 80px rgba(132, 80, 34, 0.1);
}

.lobby {
  width: min(780px, 100%);
  margin: 0 auto;
  padding: 70px 52px 58px;
  text-align: center;
}

.folk-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 26px;
  color: #a8653d;
}

.folk-divider i {
  width: 86px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #b6814e);
}

.folk-divider i:last-child {
  transform: rotate(180deg);
}

.lobby .section-kicker {
  color: #9b603a;
}

.lobby h2 {
  margin: 8px 0 12px;
  font-size: clamp(30px, 5vw, 43px);
  font-weight: 700;
}

.lobby-copy {
  max-width: 610px;
  margin: 0 auto;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.7;
}

.text-x {
  color: var(--red);
}

.text-o {
  color: var(--blue);
}

.room-form {
  max-width: 590px;
  margin: 34px auto 16px;
  text-align: left;
}

.room-form label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.room-input-row {
  display: flex;
  gap: 10px;
}

.room-form input {
  min-width: 0;
  flex: 1;
  border: 1px solid #bd8f59;
  border-radius: 9px;
  padding: 13px 15px;
  color: var(--ink);
  font-size: 17px;
  letter-spacing: 0.05em;
  background: rgba(255, 251, 235, 0.74);
  box-shadow: inset 0 2px 7px rgba(94, 56, 27, 0.08);
}

.room-form input:focus {
  outline: 3px solid rgba(35, 109, 143, 0.18);
  border-color: var(--blue);
}

.room-form > p {
  margin: 7px 2px 0;
  color: #927660;
  font-size: 12px;
}

button {
  border: 0;
}

.primary-button,
.new-room-button,
.quiet-button,
.toolbar-actions button,
.room-plaque button,
.direction-pad button {
  cursor: pointer;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.primary-button {
  border-radius: 9px;
  padding: 12px 22px;
  color: #fff8e7;
  font-weight: 800;
  background: #8c352b;
  box-shadow: 0 5px 0 #5f251f;
}

.primary-button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #9f4035;
  box-shadow: 0 7px 0 #5f251f;
}

.primary-button:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 2px 0 #5f251f;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.new-room-button {
  border: 1px solid #a97646;
  border-radius: 9px;
  padding: 10px 18px;
  color: #70452d;
  font-weight: 700;
  background: transparent;
}

.new-room-button span {
  margin-right: 5px;
  font-size: 18px;
}

.new-room-button:hover:not(:disabled) {
  background: rgba(151, 95, 52, 0.08);
}

.simple-rules {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 48px;
  text-align: left;
}

.simple-rules > div {
  display: flex;
  gap: 12px;
  border-top: 1px solid rgba(141, 96, 53, 0.32);
  padding-top: 15px;
}

.simple-rules > div > span {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #b98552;
  border-radius: 50%;
  color: #975a36;
  font-weight: 800;
}

.simple-rules p {
  margin: 0;
}

.simple-rules strong,
.simple-rules small {
  display: block;
}

.simple-rules small {
  margin-top: 4px;
  color: var(--muted);
  line-height: 1.45;
}

.play-layout {
  display: grid;
  grid-template-columns: 246px minmax(0, 1fr);
  min-height: 680px;
}

.game-sidebar {
  padding: 30px 24px;
  color: #f8e8c6;
  background:
    linear-gradient(rgba(41, 23, 14, 0.08), rgba(41, 23, 14, 0.08)),
    repeating-linear-gradient(2deg, #5c3824 0 8px, #65402a 9px 18px);
}

.room-plaque {
  border: 1px solid rgba(255, 230, 180, 0.24);
  border-radius: 9px;
  padding: 15px;
  background: rgba(32, 16, 9, 0.22);
}

.room-plaque span,
.room-plaque strong {
  display: block;
}

.room-plaque span {
  color: rgba(255, 236, 199, 0.66);
  font-size: 11px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.room-plaque strong {
  overflow: hidden;
  margin: 4px 0 10px;
  font-size: 20px;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
}

.room-plaque button {
  padding: 0;
  color: #f1c77c;
  font-size: 12px;
  text-decoration: underline;
  background: none;
}

.players-panel {
  margin-top: 28px;
}

.panel-label {
  color: #e4bb77;
}

.player-row {
  display: grid;
  grid-template-columns: 42px 1fr auto;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px;
  background: rgba(26, 13, 7, 0.18);
}

.player-row.active {
  border-color: rgba(246, 208, 135, 0.48);
  background: rgba(246, 208, 135, 0.1);
}

.piece {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  font-family: Arial, sans-serif;
  font-size: 23px;
  font-weight: 900;
  background: #f5e7c7;
  box-shadow:
    inset 0 0 0 2px rgba(92, 58, 33, 0.18),
    0 3px 7px rgba(19, 8, 3, 0.26);
}

.piece-x {
  color: var(--red);
}

.piece-o {
  color: var(--blue);
}

.player-row strong,
.player-row small {
  display: block;
}

.player-row strong {
  font-size: 14px;
}

.player-row small {
  margin-top: 2px;
  color: rgba(255, 236, 199, 0.58);
  font-size: 11px;
}

.player-row em {
  border-radius: 999px;
  padding: 3px 7px;
  color: #4f2d1c;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  background: #eac47e;
}

.match-notes {
  margin-top: 24px;
  border-top: 1px solid rgba(255, 231, 184, 0.19);
  padding-top: 14px;
}

.match-notes p {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 8px 0;
  color: rgba(255, 237, 203, 0.64);
  font-size: 12px;
}

.match-notes span {
  color: #ffe1a3;
  font-weight: 800;
}

.sidebar-actions {
  display: grid;
  gap: 12px;
  margin-top: 28px;
}

.quiet-button {
  border: 1px solid rgba(255, 230, 183, 0.28);
  border-radius: 9px;
  padding: 10px;
  color: #ffe7bd;
  background: transparent;
}

.quiet-button:hover {
  background: rgba(255, 231, 189, 0.08);
}

.board-section {
  min-width: 0;
  padding: 24px;
}

.turn-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(130, 86, 45, 0.26);
  padding: 0 2px 16px;
}

.turn-banner.victory {
  color: #7e3e28;
}

.turn-symbol {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #bd8b55;
  border-radius: 50%;
  font-family: Arial, sans-serif;
  font-size: 27px;
  font-weight: 900;
  background: #fff6dc;
}

.turn-banner small,
.turn-banner strong {
  display: block;
}

.turn-banner small {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.turn-banner strong {
  margin-top: 2px;
  font-size: 18px;
}

.notice {
  margin-top: 12px;
  border-left: 3px solid #a8533b;
  border-radius: 4px 8px 8px 4px;
  padding: 10px 13px;
  color: #773e2d;
  font-size: 13px;
  background: rgba(177, 74, 57, 0.1);
}

.board-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 17px 2px 10px;
}

.board-toolbar strong,
.board-toolbar small {
  display: block;
}

.board-toolbar strong {
  font-size: 16px;
}

.board-toolbar small {
  margin-top: 2px;
  color: var(--muted);
  font-size: 12px;
}

.toolbar-actions {
  display: flex;
  gap: 7px;
}

.toolbar-actions button,
.direction-pad button {
  border: 1px solid #b88450;
  border-radius: 7px;
  padding: 7px 10px;
  color: #6f442d;
  font-size: 12px;
  font-weight: 700;
  background: rgba(255, 250, 230, 0.62);
}

.toolbar-actions button:hover:not(:disabled),
.direction-pad button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #fff8df;
}

.board-frame {
  position: relative;
  border: 12px solid #6b4229;
  border-radius: 8px;
  padding: 5px;
  background: #3e2418;
  box-shadow:
    0 12px 25px rgba(60, 30, 13, 0.25),
    inset 0 0 0 2px #a66f40;
}

.corner {
  position: absolute;
  z-index: 2;
  width: 18px;
  height: 18px;
  pointer-events: none;
  border-color: #e3b66e;
  border-style: solid;
}

.corner-a {
  top: -7px;
  left: -7px;
  border-width: 2px 0 0 2px;
}

.corner-b {
  top: -7px;
  right: -7px;
  border-width: 2px 2px 0 0;
}

.corner-c {
  right: -7px;
  bottom: -7px;
  border-width: 0 2px 2px 0;
}

.corner-d {
  bottom: -7px;
  left: -7px;
  border-width: 0 0 2px 2px;
}

.board-viewport {
  width: 100%;
  height: clamp(420px, 58vh, 560px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: #a66f40 #ead4a9;
  scrollbar-width: thin;
  background: #e5c993;
  touch-action: pan-x pan-y;
}

.board-viewport::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.board-viewport::-webkit-scrollbar-track {
  background: #ead4a9;
}

.board-viewport::-webkit-scrollbar-thumb {
  border: 2px solid #ead4a9;
  border-radius: 999px;
  background: #9a663d;
}

.infinite-grid {
  display: grid;
  width: max-content;
  background: #c79e65;
}

.board-cell {
  position: relative;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-right: 1px solid rgba(123, 78, 40, 0.42);
  border-bottom: 1px solid rgba(123, 78, 40, 0.42);
  border-radius: 0;
  color: var(--ink);
  background:
    radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.34), transparent 42%), #f3dfb2;
}

.board-cell:disabled {
  cursor: default;
  opacity: 1;
}

.board-cell:not(:disabled):hover {
  z-index: 1;
  outline: 2px solid #9f6c3d;
  outline-offset: -3px;
  background: #faebc8;
}

.board-cell:focus-visible {
  z-index: 2;
  outline: 3px solid #493122;
  outline-offset: -4px;
}

.board-cell span {
  position: relative;
  z-index: 1;
  font-family: Arial, sans-serif;
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}

.board-cell.cell-x span {
  color: var(--red);
}

.board-cell.cell-o span {
  color: var(--blue);
}

.board-cell.latest::after {
  position: absolute;
  inset: 4px;
  border: 2px solid rgba(97, 61, 31, 0.48);
  border-radius: 50%;
  content: '';
}

.board-cell.winning {
  z-index: 1;
  background: #f7d98c;
  box-shadow: inset 0 0 0 3px #bf823a;
}

.board-cell.winning span {
  transform: scale(1.1);
}

.board-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
}

.direction-pad {
  display: flex;
  gap: 5px;
}

.direction-pad button {
  min-width: 34px;
  padding-inline: 8px;
  font-family: Arial, sans-serif;
}

footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 18px 0 0;
  color: rgba(255, 239, 208, 0.64);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-align: center;
}

footer span {
  color: #d3a15d;
}

.paper-fade-enter-active,
.paper-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.paper-fade-enter-from,
.paper-fade-leave-to {
  opacity: 0;
  transform: translateY(7px);
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

@media (max-width: 860px) {
  .game-shell {
    padding: 18px;
  }

  .play-layout {
    grid-template-columns: 1fr;
  }

  .game-sidebar {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 16px;
    padding: 20px;
  }

  .players-panel,
  .match-notes,
  .sidebar-actions {
    margin-top: 0;
  }

  .match-notes,
  .sidebar-actions {
    align-self: end;
  }
}

@media (max-width: 620px) {
  .game-shell {
    padding: 12px;
  }

  .masthead {
    align-items: flex-start;
  }

  .brand-seal {
    width: 52px;
    height: 52px;
    font-size: 17px;
  }

  .eyebrow,
  .brand-subtitle {
    display: none;
  }

  .brand h1 {
    margin-top: 8px;
    font-size: 32px;
  }

  .connection-pill {
    padding: 7px 9px;
    font-size: 0;
  }

  .connection-pill::after {
    font-size: 11px;
    content: 'Kết nối';
  }

  .lobby {
    padding: 44px 20px 38px;
  }

  .room-input-row {
    display: grid;
  }

  .simple-rules {
    grid-template-columns: 1fr;
    margin-top: 34px;
  }

  .game-sidebar {
    grid-template-columns: 1fr;
  }

  .match-notes {
    display: none;
  }

  .sidebar-actions {
    grid-template-columns: 1fr 1fr;
  }

  .board-section {
    padding: 16px 12px 20px;
  }

  .board-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .board-frame {
    border-width: 8px;
  }

  .board-viewport {
    height: 54vh;
    min-height: 390px;
  }

  .board-navigation {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
</style>
