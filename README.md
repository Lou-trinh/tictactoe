# Cờ Mộc

Trò chơi caro trực tuyến dành cho hai người, được thiết kế theo phong cách mộc
mạc gần gũi với trò chơi dân gian Việt Nam. Người chơi dùng **X đỏ son** và
**O xanh biển** trên bàn cờ màu kem; ai tạo được năm quân liên tiếp theo hàng
ngang, hàng dọc hoặc đường chéo sẽ thắng.

## Tính năng

- Bàn cờ theo hệ tọa độ không giới hạn, có thể cuộn theo mọi hướng.
- Chỉ render vùng 35 × 35 ô đang nhìn thấy để giao diện luôn nhẹ.
- Tạo phòng, chia sẻ mã phòng và chơi trực tuyến bằng Socket.IO.
- Đấu với máy ở ba mức Dễ, Thường và Khó, chạy trực tiếp trên thiết bị.
- Server kiểm tra lượt chơi, ô đã đánh và kết quả thắng.
- Tự đưa bàn cờ về gốc, đi đến nước mới nhất hoặc dịch chuyển bằng cụm điều hướng.
- Giao diện responsive cho máy tính và điện thoại.

## Công nghệ

- Frontend: Vue 3, TypeScript, Vite, Socket.IO Client.
- Backend: NestJS, TypeScript, Socket.IO.
- Kiểm thử: Jest, Supertest, ESLint, Vue TypeScript.

## Chạy local

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
cd backend
npm install
npm run start:dev
```

Mở terminal khác:

```bash
cd frontend
npm install
set VITE_SOCKET_URL=http://localhost:3000
npm run dev
```

Với PowerShell, thay lệnh `set` bằng:

```powershell
$env:VITE_SOCKET_URL = "http://localhost:3000"
```

## Kiểm tra

```bash
cd backend
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand

cd ../frontend
npm run build
npx eslint .
```

## Kiến trúc bàn cờ

Frontend giữ một cửa sổ ảo có kích thước cố định và đổi tọa độ gốc khi người
chơi cuộn gần mép. Backend lưu các nước đi dưới dạng sparse board với khóa
`row,col`, nên bộ nhớ chỉ tăng theo số nước đã đánh thay vì diện tích bàn cờ.

Trạng thái phòng hiện được lưu trong bộ nhớ của backend. Khi server khởi động
lại, các phòng đang chơi sẽ được tạo lại từ đầu.

## Ba mức độ máy chơi

Chế độ đấu máy được xử lý ngay trong frontend nên có thể bắt đầu tức thì, không
phụ thuộc trạng thái thức/ngủ hoặc quá trình triển khai của backend Render.

- **Dễ:** chọn ngẫu nhiên một ô hợp lệ gần khu vực đang chơi.
- **Thường:** biết hoàn thành nước thắng, chặn đối thủ và cân bằng công–thủ.
- **Khó:** ngoài các nước chiến thuật tức thời còn dùng minimax với alpha-beta
  để tính trước các lượt đáp trả.
