export type PlayerSymbol = 'X' | 'O';

export interface BoardMove {
  row: number;
  col: number;
  player: PlayerSymbol;
}

export type SparseBoard = Record<string, PlayerSymbol>;

export const WIN_LENGTH = 5;

export const cellKey = (row: number, col: number) => `${row},${col}`;

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

export const findWinningLine = (
  board: SparseBoard,
  row: number,
  col: number,
  player: PlayerSymbol,
): string[] | null => {
  for (const [rowStep, colStep] of DIRECTIONS) {
    const before: string[] = [];
    const after: string[] = [];

    for (let distance = 1; ; distance += 1) {
      const key = cellKey(row - rowStep * distance, col - colStep * distance);
      if (board[key] !== player) break;
      before.unshift(key);
    }

    for (let distance = 1; ; distance += 1) {
      const key = cellKey(row + rowStep * distance, col + colStep * distance);
      if (board[key] !== player) break;
      after.push(key);
    }

    const line = [...before, cellKey(row, col), ...after];
    if (line.length >= WIN_LENGTH) return line;
  }

  return null;
};
