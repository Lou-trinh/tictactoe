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

    <div v-if="winner" class="text-center mt-8">
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
}

interface GameOverEvent {
  winner: string | null;
}

interface ErrorEvent {
  message: string;
}

export default defineComponent({
  name: 'GameView',
  setup() {
    const route = useRoute();
    const router = useRouter();

    const roomId = typeof route.params.roomId === 'string' ? route.params.roomId : '';

    const board = ref<(string | null)[]>(Array(9).fill(null));
    const currentPlayer = ref<string>('X');
    const playerSymbol = ref<string | null>(null);
    const winner = ref<string | null>(null);
    const error = ref<string | null>(null);
    const isSocketConnected = ref(false);
    const socket = ref<Socket | null>(null);

    const isMyTurn = computed(() => currentPlayer.value === playerSymbol.value);

    const status = computed(() => {
      if (winner.value) {
        if (winner.value === 'Draw') {
          return 'Hòa!';
        }
        return `Người chơi ${winner.value === 'X' ? 'X' : 'O'} đã thắng!`;
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
        socket.value.emit('makeMove', { roomId: roomId, index, player: playerSymbol.value });
      }
    };

    const handleGameOver = (winningPlayer: string | null) => {
      winner.value = winningPlayer;
      console.log('Game Over. Winner:', winningPlayer);
    };

    const showError = (message: string) => {
      error.value = message;
      setTimeout(() => {
        error.value = null;
      }, 3000);
    };

    const leaveGame = () => {
      if (isSocketConnected.value) {
        socket.value?.emit('leaveGame', { roomId: roomId });
      }
      router.push({ name: 'home' });
    };

    const resetGame = () => {
      if (socket.value) {
        // Gửi sự kiện mới để yêu cầu server khởi tạo lại game
        socket.value.emit('resetGame', { roomId: roomId });
      }
      // Cập nhật trạng thái frontend để chuẩn bị cho ván mới
      winner.value = null;
      board.value = Array(9).fill(null);
      currentPlayer.value = 'X';
    };

    const initSocket = () => {
      const s = io('https://tic-tac-toe-backend-production-8fc6.up.railway.app');
      socket.value = s;

      s.on('connect', () => {
        isSocketConnected.value = true;
        console.log('CLIENT: Đã kết nối với server! ID:', s.id);
        s.emit('joinGame', { roomId: roomId });
      });

      s.on('playerAssigned', (payload: { playerSymbol: string }) => {
        playerSymbol.value = payload.playerSymbol;
        console.log(`CLIENT: Bạn được gán là người chơi: ${playerSymbol.value}`);
      });

      s.on('gameState', (payload: GameState) => {
        console.log('CLIENT: Đã nhận gameState', payload);
        board.value = payload.board;
        currentPlayer.value = payload.currentPlayer;
      });

      s.on('gameOver', (payload: GameOverEvent) => {
        console.log('CLIENT: Đã nhận gameOver. Người thắng:', payload.winner);
        handleGameOver(payload.winner);
      });

      s.on('error', (payload: ErrorEvent) => {
        console.error('CLIENT: Lỗi từ server:', payload.message);
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
