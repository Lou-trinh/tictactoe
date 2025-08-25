<template>
  <div class="home-view">
    <h1 class="text-3xl font-bold mb-4">Chào mừng đến với Tic-Tac-Toe</h1>
    <p class="mb-6">Hãy nhập ID phòng để tham gia hoặc tạo phòng mới</p>

    <div class="form-group flex flex-col md:flex-row items-center gap-4">
      <input
        type="text"
        v-model="roomId"
        placeholder="Nhập ID phòng"
        class="input-field"
        @keyup.enter="joinRoom"
      />
      <button @click="joinRoom" class="btn-join">Tham gia phòng</button>
    </div>

    <div v-if="statusMessage" class="status-message mt-6">
      {{ statusMessage }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useRouter } from 'vue-router';

export default defineComponent({
  name: 'HomeView',
  setup() {
    const router = useRouter();
    const roomId = ref('');
    const statusMessage = ref('');
    let socket: Socket | null = null;

    onMounted(() => {
      // Khởi tạo kết nối WebSocket với server
      socket = io('https://tictactoe-backend-production-faa9.up.railway.app');

      socket.on('connect', () => {
        console.log('CLIENT: Đã kết nối với server!');
        statusMessage.value = 'Đã kết nối với server!';
      });

      socket.on('disconnect', () => {
        console.log('CLIENT: Mất kết nối với server!');
        statusMessage.value = 'Mất kết nối với server!';
      });

      // Lắng nghe sự kiện 'gameReady' từ server
      socket.on('gameReady', (data: { roomId: string }) => {
        console.log('CLIENT: Phòng đã đầy, chuyển sang giao diện chơi game...', data);
        statusMessage.value = 'Đã tìm thấy đối thủ! Đang vào phòng...';

        // Chuyển hướng đến trang chơi game chỉ khi nhận được sự kiện này
        router.push({ name: 'game', params: { roomId: data.roomId } });
      });

      // Xử lý các thông báo lỗi từ server
      socket.on('error', (data: { message: string }) => {
        console.error('CLIENT: Lỗi từ server:', data.message);
        statusMessage.value = `Lỗi: ${data.message}`;
      });
    });

    onUnmounted(() => {
      if (socket) {
        socket.disconnect();
      }
    });

    const joinRoom = () => {
      if (!roomId.value) {
        statusMessage.value = 'Vui lòng nhập ID phòng.';
        return;
      }
      statusMessage.value = 'Đang tìm đối thủ...';

      // Phát sự kiện 'joinGame' đến server với ID phòng
      if (socket) {
        socket.emit('joinGame', { roomId: roomId.value });
      }
    };

    return {
      roomId,
      statusMessage,
      joinRoom,
    };
  },
});
</script>

<style scoped>
.home-view {
  text-align: center;
}
.input-field {
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 5px;
  background-color: rgba(255, 255, 255, 0.1);
  color: white;
  min-width: 250px;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  transition: all 0.3s ease;
}
.input-field:focus {
  background-color: rgba(255, 255, 255, 0.2);
  outline: none;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
}
.btn-join {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  background-color: #4f46e5;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s ease;
}
.btn-join:hover {
  background-color: #4338ca;
}
.status-message {
  padding: 10px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 5px;
}
</style>
