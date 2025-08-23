<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', { reconnection: true });

const board = ref<(string | null)[]>(Array(9).fill(null));
const player = ref<string | null>(null); // Chưa chọn X/O
const currentPlayer = ref('X');
const roomId = ref('room1');
const winner = ref<string | null>(null);
const status = ref<string>('Waiting for another player...');
const isGameDisabled = ref(true);
const error = ref<string | null>(null);
const players = ref<string[]>([]);

const setPlayer = (selectedPlayer: string) => {
  if (!players.value.includes(selectedPlayer)) {
    player.value = selectedPlayer;
    socket.emit('joinGame', { roomId: roomId.value, playerId: player.value });
  } else {
    error.value = `Player ${selectedPlayer} is already taken`;
  }
};

onMounted(() => {
  socket.on('gameState', (game: { board: (string | null)[], currentPlayer: string, players: string[] }) => {
    console.log('Received gameState:', game);
    board.value = game.board;
    currentPlayer.value = game.currentPlayer;
    players.value = game.players;
    isGameDisabled.value = game.players.length < 2;
    status.value = game.players.length < 2 ? 'Waiting for another player...' : 'Game ready!';
    error.value = null;
  });

  socket.on('gameOver', ({ winner: gameWinner }: { winner: string | null }) => {
    console.log('Game over, winner:', gameWinner);
    winner.value = gameWinner;
    isGameDisabled.value = true;
    status.value = `Game over! Winner: ${gameWinner || 'Draw'}`;
  });

  socket.on('error', ({ message }: { message: string }) => {
    console.log('Error received:', message);
    error.value = message;
  });

  socket.on('connect_error', (err) => {
    console.error('WebSocket connection error:', err);
    error.value = 'Failed to connect to server';
  });
});

onUnmounted(() => {
  socket.off('gameState');
  socket.off('gameOver');
  socket.off('error');
  socket.off('connect_error');
});

const handleClick = (index: number) => {
  if (
    board.value[index] === null &&
    currentPlayer.value === player.value &&
    !winner.value &&
    !isGameDisabled.value
  ) {
    console.log('Making move:', { roomId: roomId.value, index, player: player.value });
    socket.emit('makeMove', { roomId: roomId.value, index, player: player.value });
  } else {
    console.log('Invalid move attempt:', {
      index,
      currentPlayer: currentPlayer.value,
      player: player.value,
      isGameDisabled: isGameDisabled.value,
      winner: winner.value,
    });
  }
};
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100">
    <h1 class="text-4xl font-bold mb-8">Tic-Tac-Toe</h1>
    <div v-if="!player" class="mb-4">
      <label class="text-xl mr-2">Choose your player:</label>
      <button
        @click="setPlayer('X')"
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        :disabled="players.includes('X')"
      >
        Play as X
      </button>
      <button
        @click="setPlayer('O')"
        class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ml-2"
        :disabled="players.includes('O')"
      >
        Play as O
      </button>
    </div>
    <p v-if="status" class="mb-4 text-xl">{{ status }}</p>
    <p v-if="error" class="mb-4 text-red-500">{{ error }}</p>
    <div class="grid grid-cols-3 gap-2 w-80" v-if="player">
      <button
        v-for="(cell, index) in board"
        :key="index"
        @click="handleClick(index)"
        class="w-24 h-24 bg-white border-2 border-gray-300 text-6xl font-bold flex items-center justify-center hover:bg-gray-50"
        :disabled="isGameDisabled || currentPlayer !== player || winner"
      >
        {{ cell }}
      </button>
    </div>
    <p v-if="winner" class="mt-4 text-2xl">Winner: {{ winner }}</p>
    <p v-if="player" class="mt-2">Your turn: {{ currentPlayer === player ? 'Yes' : 'No' }}</p>
  </div>
</template>
