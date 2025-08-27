<template>
  <div class="game-view">
    <div class="text-center mb-6">
      <p class="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
        {{ status }}
      </p>
    </div>

    <Transition name="slide-fade">
      <div v-if="error" class="mb-6">
        <div class="bg-red-500/20 border border-red-400/30 text-red-200 p-4 rounded-xl text-center backdrop-blur-sm">
          <span class="text-xl mr-2">⚠️</span>
          {{ error }}
        </div>
      </div>
    </Transition>

    <div class="mb-8">
      <div class="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        <button
          v-for="(cell, index) in board"
          :key="index"
          @click="handleClick(index)"
          class="w-20 h-20 md:w-24 md:h-24 border-2 text-4xl md:text-6xl font-black flex items-center justify-center rounded-xl shadow-lg transition-all duration-300 transform active:scale-95 cursor-pointer"
          :disabled="cell !== null || !!winner || !isMyTurn"
          :class="{
            'text-red-400 bg-red-50/10 border-red-400/30': cell === 'X',
            'text-blue-400 bg-blue-50/10 border-blue-400/30': cell === 'O',
            'text-white/30 bg-white/5 border-white/10 hover:bg-white/10': cell === null,
          }"
        >
          {{ cell }}
        </button>
      </div>
    </div>

    <div v-if="winner && playerSymbol" class="text-center mt-8">
      <div class="flex flex-col md:flex-row justify-center gap-4">
        <button
          @click="resetGame"
          class="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-8 rounded-full transition-all duration-300 transform active:scale-95 shadow-lg"
        >
          Chơi lại
        </button>
        <button
          @click="leaveGame"
          class="bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 px-8 rounded-full transition-all duration-300 transform active:scale-95 shadow-lg"
        >
          Rời phòng
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { io, Socket } from 'socket.io-client';

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  players: { X: string; O: string };
  playerCount: number;
  winner?: string | null | undefined;
}

interface GameOverEvent {
  winner: string | null | undefined;
}

interface ErrorEvent {
  message: string;
}

interface PlayerAssignedEvent {
  playerSymbol: string | undefined;
  playerCount: number;
}

export default defineComponent({
  name: 'GameView',
  setup() {
    const route = useRoute();
    const router = useRouter();

    const roomId = typeof route.params.roomId === 'string' ? route.params.roomId : '';

    const board = ref<(string | null)[]>(Array(9).fill(null));
    const currentPlayer = ref<string>('X');
    const playerSymbol = ref<string | null | undefined>(null);
    const winner = ref<string | null | undefined>(null);
    const error = ref<string | null>(null);
    const isSocketConnected = ref(false);
    const socket = ref<Socket | null>(null);
    const playerCount = ref(0);

    const isMyTurn = computed(() => currentPlayer.value === playerSymbol.value);

    const status = computed(() => {
      if (winner.value) {
        if (winner.value === 'Draw') {
          return 'Hòa!';
        }
        return `Người chơi ${winner.value === 'X' ? 'X' : 'O'} đã thắng!`;
      }
      if (playerCount.value > 0 && playerCount.value < 2) {
        return `Số người chơi: ${playerCount.value}/2 - Chờ đối thủ...`;
      }
      if (!isMyTurn.value) {
        return `Đang chờ đối thủ (${currentPlayer.value}) ra quân...`;
      }
      return `Lượt của bạn (${currentPlayer.value}) ra quân!`;
    });

    const handleClick = (index: number) => {
      if (winner.value || board.value[index] !== null || !isMyTurn.value) {
        return;
      }
      if (socket.value) {
        console.log(`[Client] Emitting makeMove to room ${roomId}, index ${index}`);
        socket.value.emit('makeMove', { roomId: roomId, index, player: playerSymbol.value });
      }
    };

    const handleGameOver = (winningPlayer: string | null | undefined) => {
      winner.value = winningPlayer ?? null;
      console.log('Game Over. Winner:', winningPlayer);
    };

    const showError = (message: string) => {
      error.value = message;
      console.log(`[Client] Showing error: ${message}`);
      setTimeout(() => {
        error.value = null;
      }, 3000);
    };

    const leaveGame = () => {
      if (isSocketConnected.value) {
        console.log(`[Client] Emitting leaveGame to room ${roomId}`);
        socket.value?.emit('leaveGame', { roomId: roomId });
      }
      router.push({ name: 'home' });
    };

    const resetGame = () => {
      if (socket.value) {
        console.log(`[Client] Emitting resetGame to room ${roomId}`);
        socket.value.emit('resetGame', { roomId: roomId });
      }
      winner.value = null;
      board.value = Array(9).fill(null);
      currentPlayer.value = 'X';
    };

    const initSocket = () => {
      const s = io('https://tictactoe-backend-production-faa9.up.railway.app');
      socket.value = s;

      s.on('connect', () => {
        isSocketConnected.value = true;
        console.log(`[Client] Connected to server! ID: ${s.id}`);
        s.emit('joinGame', { roomId: roomId });
      });

      s.on('playerAssigned', (payload: PlayerAssignedEvent) => {
        playerSymbol.value = payload.playerSymbol ?? null;
        playerCount.value = payload.playerCount;
        console.log(`[Client] Assigned as player ${payload.playerSymbol}, count: ${payload.playerCount}`);
      });

      s.on('gameState', (payload: GameState) => {
        console.log(`[Client] Received gameState in room ${roomId}`, payload);
        board.value = payload.board;
        currentPlayer.value = payload.currentPlayer;
        playerCount.value = payload.playerCount;
        winner.value = payload.winner ?? null;
      });

      s.on('gameOver', (payload: GameOverEvent) => {
        console.log(`[Client] Received gameOver in room ${roomId}. Winner: ${payload.winner}`);
        handleGameOver(payload.winner);
      });

      s.on('error', (payload: ErrorEvent) => {
        console.error(`[Client] Error from server in room ${roomId}: ${payload.message}`);
        showError(payload.message);
      });
    };

    onMounted(() => {
      initSocket();
    });

    onUnmounted(() => {
      if (socket.value) {
        socket.value.disconnect();
      }
    });

    return {
      roomId,
      board,
      status,
      winner,
      error,
      isMyTurn,
      handleClick,
      leaveGame,
      resetGame,
      playerSymbol, // Đảm bảo trả về playerSymbol
    };
  },
});
</script>

<style scoped>
.game-view {
  text-align: center;
  margin-top: 50px;
}
</style>
