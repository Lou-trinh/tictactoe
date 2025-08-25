<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 flex flex-col items-center justify-center text-white p-4 md:p-8">
    <div class="backdrop-blur-xl bg-white/10 rounded-3xl p-6 md:p-12 max-w-lg w-full shadow-2xl border border-white/20 animate-fade-in">
      <div class="text-center mb-8">
        <h1 class="text-4xl md:text-6xl font-black mb-4 bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent">
          Tic-Tac-Toe
        </h1>
        <p class="text-lg text-white/80">Chế độ 2 người chơi qua WebSocket</p>
      </div>

      <div class="flex items-center justify-center gap-3 mb-6 p-3 rounded-xl border backdrop-blur-sm" :class="connectionStatus.classes">
        <span class="text-2xl">{{ connectionStatus.icon }}</span>
        <span class="font-semibold">{{ connectionStatus.text }}</span>
        <div v-if="isLoading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      </div>

      <div v-if="!playerSymbol" class="mb-8 text-center">
        <h2 class="text-2xl font-bold mb-6">Tham gia một phòng</h2>
        <div class="flex flex-col md:flex-row gap-4 items-center justify-center">
          <input
            type="text"
            v-model="roomId"
            :disabled="!isConnected || isLoading"
            placeholder="Nhập ID phòng"
            class="w-full md:w-auto p-3 rounded-xl bg-white/20 text-white placeholder-white/50 border border-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-colors duration-300"
          />
          <button
            @click="joinGame"
            :disabled="!isConnected || isLoading || !roomId"
            class="w-full md:w-auto px-6 py-3 rounded-xl font-bold transition-all duration-300 transform active:scale-95 shadow-lg"
            :class="{
              'bg-cyan-500 hover:bg-cyan-600 text-white': isConnected && !isLoading && roomId,
              'bg-gray-400 text-gray-700 cursor-not-allowed': !isConnected || isLoading || !roomId,
            }"
          >
            {{ isLoading ? 'Đang tham gia...' : 'Tham gia' }}
          </button>
        </div>
      </div>

      <div v-if="playerSymbol" class="mb-8">
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

        <div class="grid grid-cols-3 gap-3 max-w-xs mx-auto">
          <button
            v-for="(cell, index) in board"
            :key="index"
            @click="makeMove(index)"
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
            Rời Phòng
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';
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
  name: 'App',
  setup() {
    const roomId = ref('');
    const board = ref<(string | null)[]>(Array(9).fill(null));
    const currentPlayer = ref<string>('X');
    const playerSymbol = ref<string | null>(null);
    const winner = ref<string | null>(null);
    const error = ref<string | null>(null);
    const isLoading = ref(false);
    const isConnected = ref(false);
    const players = ref<{ X?: string; O?: string }>({});

    let socket: Socket | null = null;

    const connectionStatus = computed(() => {
      if (isConnected.value) {
        return {
          icon: '✅',
          text: 'Đã kết nối',
          classes: 'bg-green-500/20 border-green-400/30'
        };
      }
      return {
        icon: '❌',
        text: 'Mất kết nối',
        classes: 'bg-red-500/20 border-red-400/30'
      };
    });

    const isMyTurn = computed(() => currentPlayer.value === playerSymbol.value);

    const status = computed(() => {
      if (!playerSymbol.value) {
        return 'Chờ đối thủ...';
      }
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

    const makeMove = (index: number) => {
      if (winner.value || board.value[index] !== null || !isMyTurn.value) {
        return;
      }

      if (socket && playerSymbol.value) {
        socket.emit('makeMove', { roomId: roomId.value, index, player: playerSymbol.value });
      }
    };

    const handleGameOver = (winningPlayer: string | null) => {
      winner.value = winningPlayer;
      console.log('Game Over. Winner:', winningPlayer);
    };

    const resetGame = () => {
      if (socket) {
        // Gửi sự kiện mới để yêu cầu server khởi tạo lại game
        socket.emit('resetGame', { roomId: roomId.value });
      }
      // Cập nhật trạng thái client để chuẩn bị cho ván mới
      winner.value = null;
      board.value = Array(9).fill(null);
      currentPlayer.value = 'X';
    };

    const leaveGame = () => {
      if (socket) {
        socket.emit('leaveGame', { roomId: roomId.value });
      }
      // Reset trạng thái client về màn hình nhập ID
      roomId.value = '';
      board.value = Array(9).fill(null);
      currentPlayer.value = 'X';
      playerSymbol.value = null;
      winner.value = null;
      error.value = null;
      isLoading.value = false;
    };

    const showError = (message: string) => {
      error.value = message;
      setTimeout(() => {
        error.value = null;
      }, 3000);
    };

    const joinGame = () => {
      if (socket) {
        isLoading.value = true;
        socket.emit('joinGame', { roomId: roomId.value });
      }
    };

    const initSocket = () => {
      socket = io('https://tictactoe-backend-production-faa9.up.railway.app'); // Thay đổi URL nếu server chạy ở địa chỉ khác

      socket.on('connect', () => {
        console.log('Connected to server');
        isConnected.value = true;
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isConnected.value = false;
        leaveGame();
      });

      // New event to handle player assignment
      socket.on('playerAssigned', (payload: { playerSymbol: string }) => {
        playerSymbol.value = payload.playerSymbol;
        isLoading.value = false;
        console.log(`Bạn được gán là người chơi: ${playerSymbol.value}`);
      });

      socket.on('gameState', (payload: GameState) => {
        board.value = payload.board;
        currentPlayer.value = payload.currentPlayer;
        players.value = payload.players;
      });

      socket.on('gameOver', (payload: GameOverEvent) => {
        handleGameOver(payload.winner);
      });

      socket.on('error', (payload: ErrorEvent) => {
        showError(payload.message);
      });
    };

    onMounted(() => {
      initSocket();
    });

    return {
      roomId,
      board,
      status,
      winner,
      error,
      isLoading,
      isMyTurn,
      connectionStatus,
      playerSymbol,
      makeMove,
      joinGame,
      resetGame,
      leaveGame,
      players,
      isConnected,
    };
  },
});
</script>

<style scoped>
/* Thêm các animation cho transition */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.5s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}
</style>
