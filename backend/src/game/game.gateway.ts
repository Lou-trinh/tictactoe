import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { chooseAiMove, type AiDifficulty } from './game-ai';
import {
  cellKey,
  findWinningLine,
  type BoardMove,
  type PlayerSymbol,
  type SparseBoard,
} from './game-rules';

interface GameState {
  mode: 'online' | 'ai';
  difficulty: AiDifficulty | null;
  board: SparseBoard;
  currentPlayer: PlayerSymbol;
  players: Partial<Record<PlayerSymbol, string>>;
  winner: PlayerSymbol | null;
  lastMove: BoardMove | null;
  winningCells: string[];
  moveCount: number;
}

interface RoomPayload {
  roomId: string;
}

interface StartAiPayload {
  difficulty: AiDifficulty;
}

interface MovePayload extends RoomPayload {
  row: number;
  col: number;
}

const ROOM_ID_PATTERN = /^[\p{L}\p{N}_-]{1,32}$/u;
const AI_DIFFICULTIES = new Set<AiDifficulty>(['easy', 'normal', 'hard']);
const AI_PLAYER_ID = '__AI__';

@WebSocketGateway({
  cors: {
    origin: [
      'https://lou-trinh.github.io',
      'http://localhost:5173',
      'http://localhost:4173',
    ],
    methods: ['GET', 'POST'],
  },
})
export class GameGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly games = new Map<string, GameState>();
  private readonly aiTimers = new Map<string, ReturnType<typeof setTimeout>>();

  handleDisconnect(client: Socket) {
    for (const [roomId, game] of this.games.entries()) {
      const player = this.getPlayerSymbol(game, client.id);
      if (player) this.removePlayer(roomId, game, player, client.id);
    }
  }

  @SubscribeMessage('startAiGame')
  async handleStartAiGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: StartAiPayload,
  ) {
    if (!AI_DIFFICULTIES.has(data?.difficulty)) {
      this.sendError(client, 'Mức độ máy chơi không hợp lệ.');
      return;
    }

    const occupiedRoom = this.findRoomByClient(client.id);
    if (occupiedRoom) {
      this.sendError(client, 'Bạn đang ở một bàn cờ khác. Hãy rời bàn trước.');
      return;
    }

    const roomId = `AI-${client.id}`;
    const game = this.createGame('ai', data.difficulty);
    game.players.X = client.id;
    game.players.O = AI_PLAYER_ID;
    this.games.set(roomId, game);
    await client.join(roomId);

    client.emit('playerAssigned', {
      playerSymbol: 'X',
      playerCount: 2,
      roomId,
      mode: 'ai',
      difficulty: data.difficulty,
    });
    this.emitGameState(roomId, game);
    client.emit('gameReady', { roomId });
  }

  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RoomPayload,
  ) {
    const roomId = this.normalizeRoomId(data?.roomId);
    if (!roomId) {
      this.sendError(
        client,
        'ID phòng chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới và tối đa 32 ký tự.',
      );
      return;
    }

    const occupiedRoom = this.findRoomByClient(client.id);
    if (occupiedRoom && occupiedRoom !== roomId) {
      this.sendError(client, 'Bạn đang ở một phòng khác. Hãy rời phòng trước.');
      return;
    }

    let game = this.games.get(roomId);
    if (!game) {
      game = this.createGame('online');
      game.players.X = client.id;
      this.games.set(roomId, game);
      await client.join(roomId);
      client.emit('playerAssigned', {
        playerSymbol: 'X',
        playerCount: 1,
        roomId,
        mode: 'online',
      });
      this.emitGameState(roomId, game);
      return;
    }

    const existingPlayer = this.getPlayerSymbol(game, client.id);
    if (existingPlayer) {
      await client.join(roomId);
      client.emit('playerAssigned', {
        playerSymbol: existingPlayer,
        playerCount: this.playerCount(game),
        roomId,
        mode: 'online',
      });
      this.emitGameState(roomId, game);
      return;
    }

    if (this.playerCount(game) >= 2) {
      this.sendError(client, 'Phòng đã đủ hai người chơi.');
      return;
    }

    const assignedPlayer: PlayerSymbol = game.players.X ? 'O' : 'X';
    game.players[assignedPlayer] = client.id;
    await client.join(roomId);

    client.emit('playerAssigned', {
      playerSymbol: assignedPlayer,
      playerCount: this.playerCount(game),
      roomId,
      mode: 'online',
    });
    this.emitGameState(roomId, game);
    this.server.to(roomId).emit('gameReady', { roomId });
  }

  @SubscribeMessage('makeMove')
  handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: MovePayload,
  ) {
    const roomId = this.normalizeRoomId(data?.roomId);
    if (
      !roomId ||
      !Number.isSafeInteger(data?.row) ||
      !Number.isSafeInteger(data?.col)
    ) {
      this.sendError(client, 'Tọa độ nước đi không hợp lệ.');
      return;
    }

    const game = this.games.get(roomId);
    if (!game) {
      this.sendError(client, 'Phòng không còn tồn tại.');
      return;
    }

    const player = this.getPlayerSymbol(game, client.id);
    if (!player) {
      this.sendError(client, 'Bạn không phải người chơi trong phòng này.');
      return;
    }
    if (this.playerCount(game) < 2) {
      this.sendError(client, 'Hãy chờ đối thủ vào phòng.');
      return;
    }
    if (game.winner) {
      this.sendError(client, 'Ván đấu đã kết thúc. Hãy chọn chơi lại.');
      return;
    }
    if (game.currentPlayer !== player) {
      this.sendError(client, 'Chưa đến lượt của bạn.');
      return;
    }

    const key = cellKey(data.row, data.col);
    if (game.board[key]) {
      this.sendError(client, 'Ô này đã có quân.');
      return;
    }

    this.applyMove(game, data.row, data.col, player);
    this.emitGameState(roomId, game);
    if (game.winner) {
      this.emitGameOver(roomId, game);
    } else if (game.mode === 'ai') {
      this.queueAiMove(roomId);
    }
  }

  @SubscribeMessage('resetGame')
  handleResetGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RoomPayload,
  ) {
    const roomId = this.normalizeRoomId(data?.roomId);
    const game = roomId ? this.games.get(roomId) : undefined;
    if (!roomId || !game) {
      this.sendError(client, 'Phòng không còn tồn tại.');
      return;
    }
    if (!this.getPlayerSymbol(game, client.id)) {
      this.sendError(client, 'Bạn không phải người chơi trong phòng này.');
      return;
    }
    if (!game.winner) {
      this.sendError(client, 'Ván đấu vẫn đang diễn ra.');
      return;
    }

    this.resetGameState(game);
    this.emitGameState(roomId, game);
    this.server.to(roomId).emit('gameOver', { winner: null });
  }

  @SubscribeMessage('leaveGame')
  async handleLeaveGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RoomPayload,
  ) {
    const roomId = this.normalizeRoomId(data?.roomId);
    const game = roomId ? this.games.get(roomId) : undefined;
    if (!roomId || !game) {
      this.sendError(client, 'Phòng không còn tồn tại.');
      return;
    }

    const player = this.getPlayerSymbol(game, client.id);
    if (!player) return;

    await client.leave(roomId);
    this.removePlayer(roomId, game, player, client.id);
  }

  private createGame(
    mode: GameState['mode'],
    difficulty: AiDifficulty | null = null,
  ): GameState {
    return {
      mode,
      difficulty,
      board: {},
      currentPlayer: 'X',
      players: {},
      winner: null,
      lastMove: null,
      winningCells: [],
      moveCount: 0,
    };
  }

  private resetGameState(game: GameState) {
    game.board = {};
    game.currentPlayer = 'X';
    game.winner = null;
    game.lastMove = null;
    game.winningCells = [];
    game.moveCount = 0;
  }

  private removePlayer(
    roomId: string,
    game: GameState,
    player: PlayerSymbol,
    clientId: string,
  ) {
    if (game.mode === 'ai') {
      this.clearAiTimer(roomId);
      this.games.delete(roomId);
      return;
    }

    delete game.players[player];
    if (this.playerCount(game) === 0) {
      this.games.delete(roomId);
      return;
    }

    this.resetGameState(game);
    this.server.to(roomId).except(clientId).emit('gameNotice', {
      message:
        'Đối thủ đã rời phòng. Bàn cờ được làm mới và đang chờ người chơi mới.',
    });
    this.emitGameState(roomId, game);
    this.server
      .to(roomId)
      .emit('playerCountUpdate', { playerCount: this.playerCount(game) });
  }

  private emitGameState(roomId: string, game: GameState) {
    this.server.to(roomId).emit('gameState', {
      ...game,
      playerCount: this.playerCount(game),
    });
  }

  private getPlayerSymbol(
    game: GameState,
    clientId: string,
  ): PlayerSymbol | undefined {
    if (game.players.X === clientId) return 'X';
    if (game.players.O === clientId) return 'O';
    return undefined;
  }

  private playerCount(game: GameState) {
    if (game.mode === 'ai') return game.players.X ? 2 : 0;
    return Number(Boolean(game.players.X)) + Number(Boolean(game.players.O));
  }

  private findRoomByClient(clientId: string) {
    for (const [roomId, game] of this.games.entries()) {
      if (this.getPlayerSymbol(game, clientId)) return roomId;
    }
    return undefined;
  }

  private normalizeRoomId(roomId: unknown) {
    if (typeof roomId !== 'string') return undefined;
    const normalized = roomId.trim();
    return ROOM_ID_PATTERN.test(normalized) ? normalized : undefined;
  }

  private sendError(client: Socket, message: string) {
    client.emit('gameError', { message });
  }

  private applyMove(
    game: GameState,
    row: number,
    col: number,
    player: PlayerSymbol,
  ) {
    game.board[cellKey(row, col)] = player;
    game.lastMove = { row, col, player };
    game.moveCount += 1;

    const winningCells = findWinningLine(game.board, row, col, player);
    if (winningCells) {
      game.winner = player;
      game.winningCells = winningCells;
      return;
    }
    game.currentPlayer = player === 'X' ? 'O' : 'X';
  }

  private queueAiMove(roomId: string) {
    this.clearAiTimer(roomId);
    const timer = setTimeout(() => {
      this.aiTimers.delete(roomId);
      const game = this.games.get(roomId);
      if (
        !game ||
        game.mode !== 'ai' ||
        !game.difficulty ||
        game.winner ||
        game.currentPlayer !== 'O'
      ) {
        return;
      }

      const move = chooseAiMove(game.board, game.difficulty, 'O');
      this.applyMove(game, move.row, move.col, 'O');
      this.emitGameState(roomId, game);
      if (game.winner) this.emitGameOver(roomId, game);
    }, 420);
    this.aiTimers.set(roomId, timer);
  }

  private clearAiTimer(roomId: string) {
    const timer = this.aiTimers.get(roomId);
    if (timer) clearTimeout(timer);
    this.aiTimers.delete(roomId);
  }

  private emitGameOver(roomId: string, game: GameState) {
    this.server.to(roomId).emit('gameOver', {
      winner: game.winner,
      winningCells: game.winningCells,
    });
  }
}
