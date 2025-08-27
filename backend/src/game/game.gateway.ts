import {
  SubscribeMessage,
  WebSocketServer,
  MessageBody,
  OnGatewayDisconnect,
  ConnectedSocket,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game } from './game.schema';

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  players: { X?: string; O?: string }; // Map symbol to socketId
}

@WebSocketGateway({ cors: { origin: '*' } }) // Mở rộng CORS để kiểm tra
export class GameGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private games: { [roomId: string]: GameState } = {};

  constructor(@InjectModel(Game.name) private gameModel: Model<Game>) {}

  handleDisconnect(client: Socket) {
    for (const roomId in this.games) {
      const game = this.games[roomId];
      const playerSymbol = Object.keys(game.players).find(
        (key) => game.players[key] === client.id,
      );

      if (playerSymbol) {
        console.log(
          `[Disconnect] Player ${playerSymbol} disconnected from room ${roomId}`,
        );
        delete game.players[playerSymbol];

        if (Object.keys(game.players).length === 0) {
          console.log(`[Disconnect] Room ${roomId} deleted due to no players`);
          delete this.games[roomId];
        } else {
          console.log(
            `[Disconnect] Notifying remaining players in room ${roomId}`,
          );
          this.server.to(roomId).except(client.id).emit('error', {
            message: 'Đối thủ đã rời khỏi phòng, game kết thúc.',
          });
          game.board = Array<string | null>(9).fill(null);
          game.currentPlayer = 'X';
          this.server.to(roomId).emit('gameState', {
            board: game.board,
            currentPlayer: game.currentPlayer,
            players: game.players,
          });
          const playerCount = Object.keys(game.players).length;
          this.server.to(roomId).emit('playerCountUpdate', { playerCount });
          console.log(
            `[Disconnect] Game reset in room ${roomId}, player count: ${playerCount}`,
          );
        }
      }
    }
  }

  @SubscribeMessage('joinGame')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    let game = this.games[roomId];

    if (!game) {
      game = {
        board: Array.from({ length: 9 }, () => null),
        currentPlayer: 'X',
        players: {},
      };
      this.games[roomId] = game;
      await client.join(roomId);
      game.players.X = client.id;
      const playerCount = Object.keys(game.players).length;
      client.emit('playerAssigned', { playerSymbol: 'X', playerCount });
      console.log(`[JoinGame] Player X joined new room: ${roomId}`);
    } else if (!game.players.O && game.players.X !== client.id) {
      game.players.O = client.id;
      await client.join(roomId);
      const playerCount = Object.keys(game.players).length;
      client.emit('playerAssigned', { playerSymbol: 'O', playerCount });
      this.server.to(roomId).emit('gameReady', { roomId });
      this.server.to(roomId).emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players,
      });
      console.log(`[JoinGame] Player O joined room: ${roomId}`);
    } else {
      const message =
        game.players.X === client.id || game.players.O === client.id
          ? 'Bạn đã ở trong phòng này rồi.'
          : 'Phòng đã đầy, vui lòng chọn phòng khác.';
      client.emit('error', { message });
      console.warn(`[JoinGame] Error joining room ${roomId}: ${message}`);
    }
  }

  @SubscribeMessage('makeMove')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; index: number },
  ) {
    const { roomId, index } = data;
    const game = this.games[roomId];

    if (!game) {
      client.emit('error', {
        message: 'Game không còn tồn tại. Vui lòng tạo phòng mới.',
      });
      return;
    }
    const player = Object.keys(game.players).find(
      (key) => game.players[key] === client.id,
    );

    if (!game || !player) {
      client.emit('error', {
        message: 'Game không tồn tại hoặc bạn không phải người chơi.',
      });
      return;
    }

    if (game.board[index] === null && game.currentPlayer === player) {
      game.board[index] = player;
      const winner = this.checkWinner(game.board);
      const isDraw = this.checkDraw(game.board);

      if (winner) {
        this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
        });
        this.server.to(roomId).emit('gameOver', { winner });
        try {
          await this.gameModel.create({
            player1: game.players.X,
            player2: game.players.O,
            board: game.board,
            winner,
          });
        } catch (error) {
          console.error('Failed to save game to database:', error);
        }
        return;
      }

      if (isDraw) {
        this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
        });
        this.server.to(roomId).emit('gameOver', { winner: 'Draw' });
        try {
          await this.gameModel.create({
            player1: game.players.X,
            player2: game.players.O,
            board: game.board,
            winner: 'draw',
          });
        } catch (error) {
          console.error('Failed to save game to database:', error);
        }
        return;
      }

      game.currentPlayer = player === 'X' ? 'O' : 'X';
      this.server.to(roomId).emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players,
      });
    } else {
      client.emit('error', { message: 'Nước đi không hợp lệ.' });
    }
  }

  @SubscribeMessage('resetGame')
  handleResetGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    const game = this.games[roomId];

    if (!game) {
      client.emit('error', {
        message: 'Phòng không còn tồn tại. Vui lòng tạo phòng mới.',
      });
      return;
    }

    game.board = Array<string | null>(9).fill(null);
    game.currentPlayer = 'X';

    this.server.to(roomId).emit('gameState', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      players: game.players,
    });
    this.server.to(roomId).emit('gameOver', { winner: null });
    console.log(`[ResetGame] Game in room ${roomId} has been reset.`);
  }

  @SubscribeMessage('leaveGame')
  handleLeaveGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    const game = this.games[roomId];

    if (!game) {
      client.emit('error', {
        message: 'Phòng không còn tồn tại.',
      });
      console.log(`[LeaveGame] Room ${roomId} does not exist`);
      return;
    }

    const playerSymbol = Object.keys(game.players).find(
      (key) => game.players[key] === client.id,
    );

    if (playerSymbol) {
      console.log(`[LeaveGame] Player ${playerSymbol} leaving room ${roomId}`);
      delete game.players[playerSymbol];

      if (Object.keys(game.players).length === 0) {
        console.log(`[LeaveGame] Room ${roomId} deleted due to no players`);
        delete this.games[roomId];
      } else {
        console.log(
          `[LeaveGame] Notifying remaining players in room ${roomId}`,
        );
        this.server.to(roomId).except(client.id).emit('error', {
          message: 'Đối thủ đã rời khỏi phòng, game kết thúc.',
        });
        game.board = Array<string | null>(9).fill(null);
        game.currentPlayer = 'X';
        this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
        });
        const playerCount = Object.keys(game.players).length;
        this.server.to(roomId).emit('playerCountUpdate', { playerCount });
        console.log(
          `[LeaveGame] Game reset in room ${roomId}, player count: ${playerCount}`,
        );
      }
    } else {
      console.log(
        `[LeaveGame] Player ${client.id} not found in room ${roomId}`,
      );
    }
  }

  private checkWinner(board: (string | null)[]): string | null {
    const wins = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (let i = 0; i < wins.length; i++) {
      const [a, b, c] = wins[i];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  private checkDraw(board: (string | null)[]): boolean {
    return board.every((cell) => cell !== null);
  }
}
