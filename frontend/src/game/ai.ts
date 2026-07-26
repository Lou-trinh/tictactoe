export type PlayerSymbol = 'X' | 'O'
export type AiDifficulty = 'easy' | 'normal' | 'hard'
export type SparseBoard = Record<string, PlayerSymbol>

export interface AiMove {
  row: number
  col: number
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

const WIN_LENGTH = 5
const WIN_SCORE = 100_000_000
const HARD_ROOT_LIMIT = 10
const HARD_BRANCH_LIMIT = 8

export const cellKey = (row: number, col: number) => `${row},${col}`

const parseCellKey = (key: string): AiMove => {
  const [row = 0, col = 0] = key.split(',').map(Number)
  return { row, col }
}

const compareMoves = (left: AiMove, right: AiMove) =>
  Math.abs(left.row) + Math.abs(left.col) - Math.abs(right.row) - Math.abs(right.col) ||
  left.row - right.row ||
  left.col - right.col

export const findWinningLine = (
  board: SparseBoard,
  row: number,
  col: number,
  player: PlayerSymbol,
): string[] | null => {
  for (const [rowStep, colStep] of DIRECTIONS) {
    const before: string[] = []
    const after: string[] = []

    for (let distance = 1; ; distance += 1) {
      const key = cellKey(row - rowStep * distance, col - colStep * distance)
      if (board[key] !== player) break
      before.unshift(key)
    }

    for (let distance = 1; ; distance += 1) {
      const key = cellKey(row + rowStep * distance, col + colStep * distance)
      if (board[key] !== player) break
      after.push(key)
    }

    const line = [...before, cellKey(row, col), ...after]
    if (line.length >= WIN_LENGTH) return line
  }

  return null
}

const collectCandidates = (board: SparseBoard, radius = 2): AiMove[] => {
  const occupiedKeys = Object.keys(board)
  if (occupiedKeys.length === 0) return [{ row: 0, col: 0 }]

  const candidateKeys = new Set<string>()
  for (const key of occupiedKeys) {
    const { row, col } = parseCellKey(key)
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) continue
        const candidateKey = cellKey(row + rowOffset, col + colOffset)
        if (!board[candidateKey]) candidateKeys.add(candidateKey)
      }
    }
  }

  return [...candidateKeys].map(parseCellKey).sort(compareMoves)
}

const lineScore = (stones: number, openEnds: number) => {
  if (stones >= 5) return WIN_SCORE
  if (stones === 4) return openEnds === 2 ? 4_000_000 : 800_000
  if (stones === 3) return openEnds === 2 ? 160_000 : 24_000
  if (stones === 2) return openEnds === 2 ? 8_000 : 1_200
  return openEnds === 2 ? 260 : 40
}

const scoreMoveForPlayer = (board: SparseBoard, move: AiMove, player: PlayerSymbol) => {
  let total = 0
  let strongestLine = 0

  for (const [rowStep, colStep] of DIRECTIONS) {
    let stones = 1
    let openEnds = 0

    for (const direction of [-1, 1] as const) {
      let distance = 1
      while (
        board[
          cellKey(
            move.row + rowStep * distance * direction,
            move.col + colStep * distance * direction,
          )
        ] === player
      ) {
        stones += 1
        distance += 1
      }

      const edgeKey = cellKey(
        move.row + rowStep * distance * direction,
        move.col + colStep * distance * direction,
      )
      if (!board[edgeKey]) openEnds += 1
    }

    const score = lineScore(stones, openEnds)
    strongestLine = Math.max(strongestLine, score)
    total += score
  }

  return strongestLine * 2 + total
}

const isWinningMove = (board: SparseBoard, move: AiMove, player: PlayerSymbol) => {
  const key = cellKey(move.row, move.col)
  board[key] = player
  const isWinner = Boolean(findWinningLine(board, move.row, move.col, player))
  delete board[key]
  return isWinner
}

const moveHeuristic = (
  board: SparseBoard,
  move: AiMove,
  player: PlayerSymbol,
  opponent: PlayerSymbol,
) => scoreMoveForPlayer(board, move, player) * 1.08 + scoreMoveForPlayer(board, move, opponent)

const orderedCandidates = (
  board: SparseBoard,
  player: PlayerSymbol,
  opponent: PlayerSymbol,
  limit?: number,
) => {
  const moves = collectCandidates(board).map((move) => ({
    ...move,
    score:
      (isWinningMove(board, move, player) ? WIN_SCORE : 0) +
      (isWinningMove(board, move, opponent) ? WIN_SCORE * 0.92 : 0) +
      moveHeuristic(board, move, player, opponent),
  }))

  moves.sort((left, right) => right.score - left.score || compareMoves(left, right))
  return typeof limit === 'number' ? moves.slice(0, limit) : moves
}

const bestPositionPotential = (board: SparseBoard, player: PlayerSymbol, opponent: PlayerSymbol) =>
  orderedCandidates(board, player, opponent, 1)[0]?.score ?? 0

const evaluatePosition = (board: SparseBoard, aiPlayer: PlayerSymbol, humanPlayer: PlayerSymbol) =>
  bestPositionPotential(board, aiPlayer, humanPlayer) -
  bestPositionPotential(board, humanPlayer, aiPlayer) * 1.12

const minimax = (
  board: SparseBoard,
  depth: number,
  maximizing: boolean,
  aiPlayer: PlayerSymbol,
  humanPlayer: PlayerSymbol,
  lastMove: (AiMove & { player: PlayerSymbol }) | null,
  alpha: number,
  beta: number,
): number => {
  if (lastMove && findWinningLine(board, lastMove.row, lastMove.col, lastMove.player)) {
    return lastMove.player === aiPlayer ? WIN_SCORE + depth : -WIN_SCORE - depth
  }
  if (depth === 0) return evaluatePosition(board, aiPlayer, humanPlayer)

  const player = maximizing ? aiPlayer : humanPlayer
  const opponent = maximizing ? humanPlayer : aiPlayer
  const moves = orderedCandidates(board, player, opponent, HARD_BRANCH_LIMIT)

  if (maximizing) {
    let bestScore = -Infinity
    for (const move of moves) {
      const key = cellKey(move.row, move.col)
      board[key] = player
      bestScore = Math.max(
        bestScore,
        minimax(board, depth - 1, false, aiPlayer, humanPlayer, { ...move, player }, alpha, beta),
      )
      delete board[key]
      alpha = Math.max(alpha, bestScore)
      if (beta <= alpha) break
    }
    return bestScore
  }

  let bestScore = Infinity
  for (const move of moves) {
    const key = cellKey(move.row, move.col)
    board[key] = player
    bestScore = Math.min(
      bestScore,
      minimax(board, depth - 1, true, aiPlayer, humanPlayer, { ...move, player }, alpha, beta),
    )
    delete board[key]
    beta = Math.min(beta, bestScore)
    if (beta <= alpha) break
  }
  return bestScore
}

const chooseTacticalMove = (board: SparseBoard, moves: AiMove[], player: PlayerSymbol) =>
  moves.find((move) => isWinningMove(board, move, player))

export const chooseAiMove = (
  board: SparseBoard,
  difficulty: AiDifficulty,
  aiPlayer: PlayerSymbol = 'O',
  random: () => number = Math.random,
): AiMove => {
  const humanPlayer: PlayerSymbol = aiPlayer === 'X' ? 'O' : 'X'
  const candidates = collectCandidates(board, difficulty === 'easy' ? 1 : 2)

  if (difficulty === 'easy') {
    return candidates[Math.floor(random() * candidates.length)] ?? { row: 0, col: 0 }
  }

  const winningMove = chooseTacticalMove(board, candidates, aiPlayer)
  if (winningMove) return winningMove

  const blockingMove = chooseTacticalMove(board, candidates, humanPlayer)
  if (blockingMove) return blockingMove

  const orderedMoves = orderedCandidates(
    board,
    aiPlayer,
    humanPlayer,
    difficulty === 'hard' ? HARD_ROOT_LIMIT : undefined,
  )

  if (difficulty === 'normal') {
    const variedChoices = orderedMoves.slice(0, Math.min(3, orderedMoves.length))
    const selectedMove = variedChoices[Math.floor(random() * variedChoices.length)]
    return selectedMove ? { row: selectedMove.row, col: selectedMove.col } : { row: 0, col: 0 }
  }

  let bestMove = orderedMoves[0] ?? { row: 0, col: 0, score: 0 }
  let bestScore = -Infinity

  for (const move of orderedMoves) {
    const key = cellKey(move.row, move.col)
    board[key] = aiPlayer
    const score = minimax(
      board,
      2,
      false,
      aiPlayer,
      humanPlayer,
      { ...move, player: aiPlayer },
      -Infinity,
      Infinity,
    )
    delete board[key]

    if (score > bestScore) {
      bestScore = score
      bestMove = move
    }
  }

  return { row: bestMove.row, col: bestMove.col }
}
