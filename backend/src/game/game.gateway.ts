import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  cellKey,
  findWinningLine,
  type BoardMove,
  type PlayerSymbol,
  type SparseBoard,
} from './game-rules';

interface GameState {
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

interface MovePayload extends RoomPayload {
  row: number;
  col: number;
}

const ROOM_ID_PATTERN = /^[\p{L}\p{N}_-]{1,32}$/u;

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

  handleDisconnect(client: Socket) {
    for (const [roomId, game] of this.games.entries()) {
      const player = this.getPlayerSymbol(game, client.id);
      if (player) this.removePlayer(roomId, game, player, client.id);
    }
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
      game = this.createGame();
      game.players.X = client.id;
      this.games.set(roomId, game);
      await client.join(roomId);
      client.emit('playerAssigned', { playerSymbol: 'X', playerCount: 1 });
      this.emitGameState(roomId, game);
      return;
    }

    const existingPlayer = this.getPlayerSymbol(game, client.id);
    if (existingPlayer) {
      await client.join(roomId);
      client.emit('playerAssigned', {
        playerSymbol: existingPlayer,
        playerCount: this.playerCount(game),
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

    game.board[key] = player;
    game.lastMove = { row: data.row, col: data.col, player };
    game.moveCount += 1;

    const winningCells = findWinningLine(
      game.board,
      data.row,
      data.col,
      player,
    );
    if (winningCells) {
      game.winner = player;
      game.winningCells = winningCells;
    } else {
      game.currentPlayer = player === 'X' ? 'O' : 'X';
    }

    this.emitGameState(roomId, game);
    if (game.winner) {
      this.server.to(roomId).emit('gameOver', {
        winner: game.winner,
        winningCells: game.winningCells,
      });
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

  private createGame(): GameState {
    return {
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
}
