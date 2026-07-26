import {
  cellKey,
  findWinningLine,
  type PlayerSymbol,
  type SparseBoard,
} from './game-rules';

const boardWith = (
  coordinates: Array<[number, number]>,
  player: PlayerSymbol = 'X',
): SparseBoard =>
  Object.fromEntries(
    coordinates.map(([row, col]) => [cellKey(row, col), player]),
  );

describe('findWinningLine', () => {
  it.each([
    {
      name: 'horizontal',
      coordinates: [
        [2, -2],
        [2, -1],
        [2, 0],
        [2, 1],
        [2, 2],
      ] as Array<[number, number]>,
      lastMove: [2, 0] as [number, number],
    },
    {
      name: 'vertical',
      coordinates: [
        [-4, 8],
        [-3, 8],
        [-2, 8],
        [-1, 8],
        [0, 8],
      ] as Array<[number, number]>,
      lastMove: [-1, 8] as [number, number],
    },
    {
      name: 'descending diagonal',
      coordinates: [
        [-2, -2],
        [-1, -1],
        [0, 0],
        [1, 1],
        [2, 2],
      ] as Array<[number, number]>,
      lastMove: [1, 1] as [number, number],
    },
    {
      name: 'ascending diagonal',
      coordinates: [
        [-2, 2],
        [-1, 1],
        [0, 0],
        [1, -1],
        [2, -2],
      ] as Array<[number, number]>,
      lastMove: [0, 0] as [number, number],
    },
  ])('detects a five-stone $name line', ({ coordinates, lastMove }) => {
    const board = boardWith(coordinates);
    const result = findWinningLine(board, lastMove[0], lastMove[1], 'X');

    expect(result).toHaveLength(5);
    expect(result).toEqual(
      expect.arrayContaining(
        coordinates.map(([row, col]) => cellKey(row, col)),
      ),
    );
  });

  it('does not bridge a gap between stones', () => {
    const board = boardWith([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 4],
      [0, 5],
    ]);

    expect(findWinningLine(board, 0, 2, 'X')).toBeNull();
  });

  it('returns the complete contiguous line when it is longer than five', () => {
    const coordinates = Array.from(
      { length: 6 },
      (_, col) => [5, col - 3] as [number, number],
    );
    const board = boardWith(coordinates, 'O');

    expect(findWinningLine(board, 5, 0, 'O')).toHaveLength(6);
  });
});
