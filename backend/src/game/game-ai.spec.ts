import { cellKey, type SparseBoard } from './game-rules';
import { chooseAiMove, type AiDifficulty } from './game-ai';

const boardWith = (entries: Array<[number, number, 'X' | 'O']>): SparseBoard =>
  Object.fromEntries(
    entries.map(([row, col, player]) => [cellKey(row, col), player]),
  );

describe('chooseAiMove', () => {
  it.each<AiDifficulty>(['easy', 'normal', 'hard'])(
    'returns the center on an empty board at %s difficulty',
    (difficulty) => {
      expect(chooseAiMove({}, difficulty, 'O', () => 0)).toEqual({
        row: 0,
        col: 0,
      });
    },
  );

  it.each<AiDifficulty>(['normal', 'hard'])(
    '%s finishes an immediate five-stone line',
    (difficulty) => {
      const board = boardWith([
        [4, 2, 'O'],
        [4, 3, 'O'],
        [4, 4, 'O'],
        [4, 5, 'O'],
        [3, 3, 'X'],
      ]);

      const move = chooseAiMove(board, difficulty, 'O', () => 0);
      expect(['4,1', '4,6']).toContain(cellKey(move.row, move.col));
    },
  );

  it.each<AiDifficulty>(['normal', 'hard'])(
    '%s blocks an immediate human win',
    (difficulty) => {
      const board = boardWith([
        [-2, 8, 'X'],
        [-1, 8, 'X'],
        [0, 8, 'X'],
        [1, 8, 'X'],
        [5, 5, 'O'],
      ]);

      const move = chooseAiMove(board, difficulty, 'O', () => 0);
      expect(['-3,8', '2,8']).toContain(cellKey(move.row, move.col));
    },
  );

  it('easy chooses a legal nearby move without tactical guarantees', () => {
    const board = boardWith([[100, -100, 'X']]);
    const move = chooseAiMove(board, 'easy', 'O', () => 0);

    expect(board[cellKey(move.row, move.col)]).toBeUndefined();
    expect(Math.abs(move.row - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(move.col + 100)).toBeLessThanOrEqual(1);
  });
});
