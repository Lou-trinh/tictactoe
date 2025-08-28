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
  players: { X?: string; O?: string };
  winner?: string | null;
}

@WebSocketGateway({ cors: { origin: '*' } })
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
          `[Disconnect] Player ${playerSymbol} disconnected from room ${roomId}, client: ${client.id}`,
        );
        delete game.players[playerSymbol];

        const remainingPlayers = Object.keys(game.players).length;

        if (remainingPlayers === 0) {
          console.log(`[Disconnect] No players left, deleting room ${roomId}`);
          delete this.games[roomId];
        } else {
          console.log(
            `[Disconnect] Notifying remaining players in room ${roomId}`,
          );
          // Reset board when a player leaves
          game.board = Array<string | null>(9).fill(null);
          game.currentPlayer = 'X';
          game.winner = null;

          this.server.to(roomId).except(client.id).emit('error', {
            message:
              'Đối thủ đã rời khỏi phòng. Bàn cờ đã được reset. Đang chờ người chơi mới hoặc đối thủ quay lại.',
          });
          const playerCount = remainingPlayers;
          this.server.to(roomId).emit('gameState', {
            board: game.board,
            currentPlayer: game.currentPlayer,
            players: game.players,
            winner: game.winner,
            playerCount,
          });
          this.server.to(roomId).emit('playerCountUpdate', { playerCount });
          console.log(
            `[Disconnect] Game state updated in room ${roomId}, player count: ${playerCount}, winner: ${game.winner}`,
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
    console.log(
      `[JoinGame] Attempting to join room ${roomId}, client: ${client.id}, existing players:`,
      game ? game.players : 'none',
    );

    // Case 1: Room doesn't exist, create a new one.
    if (!game) {
      console.log(
        `[JoinGame] Room ${roomId} does not exist, creating new room`,
      );
      game = {
        board: Array.from({ length: 9 }, () => null),
        currentPlayer: 'X',
        players: {},
        winner: null,
      };
      this.games[roomId] = game;
      await client.join(roomId);
      game.players.X = client.id;
      client.emit('playerAssigned', { playerSymbol: 'X', playerCount: 1 });
      console.log(
        `[JoinGame] Player X joined new room: ${roomId}, playerCount: 1, players:`,
        game.players,
      );
      return;
    }

    // Case 2: Player is already in the room.
    const existingPlayerSymbol = Object.keys(game.players).find(
      (key) => game.players[key] === client.id,
    );
    if (existingPlayerSymbol) {
      console.log(
        `[JoinGame] Player ${existingPlayerSymbol} is already in room ${roomId}. Sending existing info.`,
      );
      const playerCount = Object.keys(game.players).length;
      client.emit('playerAssigned', {
        playerSymbol: existingPlayerSymbol,
        playerCount,
      });
      this.server.to(roomId).emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players,
        winner: game.winner,
        playerCount,
      });
      return;
    }

    // Case 3: A new player is trying to join.
    const playerCount = Object.keys(game.players).length;
    console.log(
      `[JoinGame] Current player count in room ${roomId}: ${playerCount}`,
    );

    if (playerCount >= 2) {
      client.emit('error', { message: 'Phòng đã đầy.' });
      console.warn(
        `[JoinGame] Room ${roomId} is full with ${playerCount} players, denying ${client.id}`,
      );
      return;
    }

    let assignedSymbol: string | null = null;
    if (!game.players.X) {
      game.players.X = client.id;
      assignedSymbol = 'X';
    } else if (!game.players.O) {
      game.players.O = client.id;
      assignedSymbol = 'O';
    }

    if (assignedSymbol) {
      await client.join(roomId);
      const updatedPlayerCount = Object.keys(game.players).length;
      client.emit('playerAssigned', {
        playerSymbol: assignedSymbol,
        playerCount: updatedPlayerCount,
      });
      console.log(
        `[JoinGame] Player ${assignedSymbol} joined room: ${roomId}, playerCount: ${updatedPlayerCount}, players:`,
        game.players,
      );

      this.server.to(roomId).emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players,
        winner: game.winner,
        playerCount: updatedPlayerCount,
      });

      if (updatedPlayerCount === 2) {
        this.server.to(roomId).emit('gameReady', { roomId });
      }
    } else {
      client.emit('error', {
        message: 'Không thể vào phòng. Vui lòng thử lại.',
      });
      console.warn(
        `[JoinGame] Assignment failed for room ${roomId}, players:`,
        game.players,
      );
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
        game.winner = winner;
        const playerCount = Object.keys(game.players).length;
        this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
          winner: game.winner,
          playerCount,
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
        game.winner = 'Draw';
        const playerCount = Object.keys(game.players).length;
        this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
          winner: game.winner,
          playerCount,
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
      const playerCount = Object.keys(game.players).length;
      this.server.to(roomId).emit('gameState', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        players: game.players,
        winner: game.winner,
        playerCount,
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
    game.winner = null;
    const playerCount = Object.keys(game.players).length;
    this.server.to(roomId).emit('gameState', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      players: game.players,
      winner: game.winner,
      playerCount,
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
      console.log(
        `[LeaveGame] Player ${playerSymbol} leaving room ${roomId}, client: ${client.id}`,
      );
      delete game.players[playerSymbol];

      const remainingPlayers = Object.keys(game.players).length;

      if (remainingPlayers === 0) {
        console.log(`[LeaveGame] No players left, deleting room ${roomId}`);
        delete this.games[roomId];
      } else {
        console.log(
          `[LeaveGame] Notifying remaining players in room ${roomId}, players:`,
          game.players,
        );
        // Reset board when a player leaves
        game.board = Array<string | null>(9).fill(null);
        game.currentPlayer = 'X';
        game.winner = null;

        this.server.to(roomId).except(client.id).emit('error', {
          message:
            'Đối thủ đã rời khỏi phòng. Bàn cờ đã được reset. Đang chờ người chơi mới hoặc đối thủ quay lại.',
        });
        const playerCount = remainingPlayers;
        this.server.to(roomId).emit('gameState', {
          board: game.board,
          currentPlayer: game.currentPlayer,
          players: game.players,
          winner: game.winner,
          playerCount,
        });
        this.server.to(roomId).emit('playerCountUpdate', { playerCount });
        console.log(
          `[LeaveGame] Game state updated in room ${roomId}, player count: ${playerCount}, winner: ${game.winner}`,
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