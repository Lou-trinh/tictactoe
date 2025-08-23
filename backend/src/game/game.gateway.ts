import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game } from './game.schema';

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  players: string[];
}

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway {
  @WebSocketServer() server: Server;
  private games: { [roomId: string]: GameState } = {};

  constructor(@InjectModel(Game.name) private gameModel: Model<Game>) {}

  @SubscribeMessage('joinGame')
  handleJoin(
    @MessageBody() { roomId, playerId }: { roomId: string; playerId: string },
  ) {
    if (!this.games[roomId]) {
      this.games[roomId] = {
        board: Array<string | null>(9).fill(null),
        currentPlayer: 'X',
        players: [playerId],
      };
    } else if (
      this.games[roomId].players.length < 2 &&
      !this.games[roomId].players.includes(playerId)
    ) {
      this.games[roomId].players.push(playerId);
    } else {
      this.server
        .to(playerId)
        .emit('error', { message: 'Room is full or player already joined' });
      return;
    }
    console.log(
      `Player ${playerId} joined room ${roomId}. Players: ${this.games[roomId].players.join(', ')}`,
    ); // Sửa lỗi ESLint
    this.server.to(roomId).emit('gameState', this.games[roomId]);
  }

  @SubscribeMessage('makeMove')
  async handleMove(
    @MessageBody()
    {
      roomId,
      index,
      player,
    }: {
      roomId: string;
      index: number;
      player: string;
    },
  ) {
    const game = this.games[roomId];
    if (!game) {
      this.server.to(player).emit('error', { message: 'Room does not exist' });
      return;
    }
    if (game.players.length < 2) {
      this.server
        .to(player)
        .emit('error', { message: 'Waiting for another player' });
      return;
    }
    if (game.board[index] === null && game.currentPlayer === player) {
      game.board[index] = player;
      game.currentPlayer = player === 'X' ? 'O' : 'X';
      console.log(`Move made in room ${roomId}:`, game);
      this.server.to(roomId).emit('gameState', game);

      const winner = this.checkWinner(game.board);
      if (winner) {
        this.server.to(roomId).emit('gameOver', { winner });
        await this.gameModel.create({
          player1: game.players[0],
          player2: game.players[1],
          board: game.board,
          winner,
        });
        delete this.games[roomId];
      }
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
    for (const [a, b, c] of wins) {
      if (board[a] && board[a] === board[b] && board[a] === board[c])
        return board[a];
    }
    return null;
  }
}
