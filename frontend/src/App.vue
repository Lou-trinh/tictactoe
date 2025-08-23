<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

const board = ref<(string | null)[]>(Array(9).fill(null));
const player = ref('X'); // Thay đổi thành 'O' cho player 2
const currentPlayer = ref('X');
const roomId = ref('room1');
const winner = ref<string | null>(null);
const status = ref<string>('Waiting for another player...');
const isGameDisabled = ref(true); // Vô hiệu hóa game cho đến khi đủ 2 người

onMounted(() => {
  socket.emit('joinGame', { roomId: roomId.value, playerId: player.value });

  socket.on('gameState', (game: { board: (string | null)[], currentPlayer: string, players: string[] }) => {
    console.log('Received gameState:', game); // Debug
    board.value = game.board;
    currentPlayer.value = game.currentPlayer;
    isGameDisabled.value = game.players.length < 2;
    status.value = game.players.length < 2 ? 'Waiting for another player...' : 'Game ready!';
  });

  socket.on('gameOver', ({ winner: gameWinner }: { winner: string | null }) => {
    console.log('Game over, winner:', gameWinner); // Debug
    winner.value = gameWinner;
    isGameDisabled.value = true;
  });

  socket.on('connect_error', (error) => {
    console.error('WebSocket connection error:', error); // Debug
  });
});

onUnmounted(() => {
  socket.off('gameState');
  socket.off('gameOver');
  socket.off('connect_error');
});

const handleClick = (index: number) => {
  if (board.value[index] === null && currentPlayer.value === player.value && !winner.value && !isGameDisabled.value) {
    console.log('Making move:', { roomId: roomId.value, index, player: player.value }); // Debug
    socket.emit('makeMove', { roomId: roomId.value, index, player: player.value });
  }
};
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100">
    <h1 class="text-4xl font-bold mb-8">Tic-Tac-Toe</h1>
    <p v-if="status" class="mb-4 text-xl">{{ status }}</p>
    <div class="grid grid-cols-3 gap-2 w-80">
      <button
        v-for="(cell, index) in board"
        :key="index"
        @click="handleClick(index)"
        class="w-24 h-24 bg-white border-2 border-gray-300 text-6xl font-bold flex items-center justify-center hover:bg-gray-50"
        :disabled="isGameDisabled"
      >
        {{ cell }}
      </button>
    </div>
    <p v-if="winner" class="mt-4 text-2xl">Winner: {{ winner }}</p>
    <p class="mt-2">Your turn: {{ currentPlayer === player ? 'Yes' : 'No' }}</p>
  </div>
</template>
