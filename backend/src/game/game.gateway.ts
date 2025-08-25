import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  OnGatewayDisconnect,
  ConnectedSocket,
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

@WebSocketGateway({ cors: { origin: 'http://localhost:5173' } })
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
        delete game.players[playerSymbol];
        console.log(`Player ${playerSymbol} disconnected from room ${roomId}`);

        if (Object.keys(game.players).length === 0) {
          delete this.games[roomId];
          console.log(`Room ${roomId} deleted due to no players`);
        } else {
          void this.server.to(roomId).emit('error', {
            message: 'Đối thủ đã rời khỏi phòng, game kết thúc.',
          });
        }
      }
    }
  }

  @SubscribeMessage('joinGame')
  handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    let game = this.games[roomId];

    if (!game) {
      // Create a new game if the room does not exist
      game = {
        board: Array.from({ length: 9 }, () => null),
        currentPlayer: 'X',
        players: {},
      };
      this.games[roomId] = game;
      client.join(roomId);
      game.players.X = client.id;
      void client.emit('playerAssigned', { playerSymbol: 'X' });
      console.log(`Player X joined new room: ${roomId}`);
    } else if (!game.players.O && game.players.X !== client.id) {
      // Add the second player to the existing room
      game.players.O = client.id;
      client.join(roomId);
      void client.emit('playerAssigned', { playerSymbol: 'O' });
      void this.server.to(roomId).emit('gameReady', { roomId });
      void this.server.to(roomId).emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players,
      });
      console.log(`Player O joined room: ${roomId}`);
    } else {
      // Handle cases where the room is full or the player is already in the room
      const message =
        game.players.X === client.id || game.players.O === client.id
          ? 'Bạn đã ở trong phòng này rồi.'
          : 'Phòng đã đầy, vui lòng chọn phòng khác.';
      void client.emit('error', { message });
      console.warn(`Error joining room: ${message}`);
    }
  }

  @SubscribeMessage('makeMove')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; index: number },
  ) {
    const { roomId, index } = data;
    const game = this.games[roomId];

    // Kiểm tra nếu game không tồn tại
    if (!game) {
      void client.emit('error', {
        message: 'Game không còn tồn tại. Vui lòng tạo phòng mới.',
      });
      return;
    }
    const player = Object.keys(game.players).find(
      (key) => game.players[key] === client.id,
    );

    if (!game || !player) {
      void client.emit('error', {
        message: 'Game không tồn tại hoặc bạn không phải người chơi.',
      });
      return;
    }

    // Kiểm tra nước đi hợp lệ
    if (game.board[index] === null && game.currentPlayer === player) {
      // 1. Cập nhật trạng thái bàn cờ
      game.board[index] = player;

      // 2. Kiểm tra người thắng
      const winner = this.checkWinner(game.board);
      const isDraw = this.checkDraw(game.board);

      if (winner) {
        // Gửi trạng thái bàn cờ cuối cùng và thông báo người thắng
        void this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
        });
        void this.server.to(roomId).emit('gameOver', { winner });
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
        // delete this.games[roomId]; // Đã được comment để cho phép chơi lại
        return;
      }

      if (isDraw) {
        // Gửi trạng thái bàn cờ cuối cùng và thông báo hòa
        void this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
        });
        void this.server.to(roomId).emit('gameOver', { winner: 'Draw' });
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
        // delete this.games[roomId]; // Đã được comment để cho phép chơi lại
        return;
      }

      // Nếu chưa có người thắng, chuyển lượt chơi và gửi trạng thái mới
      game.currentPlayer = player === 'X' ? 'O' : 'X';
      void this.server.to(roomId).emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players,
      });
    } else {
      void client.emit('error', { message: 'Nước đi không hợp lệ.' });
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
      void client.emit('error', {
        message: 'Phòng không còn tồn tại. Vui lòng tạo phòng mới.',
      });
      return;
    }

    // Reset trạng thái của game
    game.board = Array<string | null>(9).fill(null);
    game.currentPlayer = 'X';

    // Gửi thông báo cho cả hai người chơi trong phòng
    void this.server.to(roomId).emit('gameState', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      players: game.players,
    });
    void this.server.to(roomId).emit('gameOver', { winner: null });
    console.log(`Game in room ${roomId} has been reset.`);
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
