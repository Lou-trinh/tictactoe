# Cờ Mộc

Trò chơi caro trực tuyến dành cho hai người, được thiết kế theo phong cách mộc
mạc gần gũi với trò chơi dân gian Việt Nam. Người chơi dùng **X đỏ son** và
**O xanh biển** trên bàn cờ màu kem; ai tạo được năm quân liên tiếp theo hàng
ngang, hàng dọc hoặc đường chéo sẽ thắng.

## Tính năng

- Bàn cờ theo hệ tọa độ không giới hạn, nhấn giữ và kéo theo mọi hướng.
- Khung nhìn đứng yên sau mỗi nước; nhấn giữ rồi kéo để di chuyển bàn cờ.
- Chỉ render vùng 35 × 35 ô đang nhìn thấy để giao diện luôn nhẹ.
- Tạo phòng, chia sẻ mã phòng và chơi trực tuyến trực tiếp giữa hai trình duyệt bằng WebRTC.
- Đấu với máy ở ba mức Dễ, Thường và Khó, chạy trực tiếp trên thiết bị.
- Thiết bị tạo phòng giữ trạng thái, kiểm tra lượt chơi, ô đã đánh và kết quả thắng.
- Tự đưa bàn cờ về gốc, đi đến nước mới nhất hoặc dịch chuyển bằng cụm điều hướng.
- Giao diện responsive cho máy tính và điện thoại.

## Công nghệ

- Frontend: Vue 3, TypeScript, Vite, PeerJS/WebRTC.
- Backend NestJS/Socket.IO vẫn được giữ trong repository cho mục đích tham khảo và phát triển.
- Kiểm thử: Jest, Supertest, ESLint, Vue TypeScript.

## Chạy local

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
cd frontend
pnpm install
npm run dev
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
chơi kéo gần mép. Thiết bị tạo phòng lưu các nước đi dưới dạng sparse board với khóa
`row,col`, rồi đồng bộ trạng thái qua kênh dữ liệu WebRTC nên bộ nhớ chỉ tăng theo
số nước đã đánh thay vì diện tích bàn cờ.

Mã phòng chỉ dùng để hai trình duyệt tìm nhau qua máy chủ tín hiệu PeerJS. Sau khi
kết nối, trạng thái ván cờ được truyền trực tiếp giữa hai thiết bị.

## Ba mức độ máy chơi

Chế độ đấu máy được xử lý ngay trong frontend nên có thể bắt đầu tức thì, không
phụ thuộc trạng thái thức/ngủ hoặc quá trình triển khai của backend Render.

- **Dễ:** chọn ngẫu nhiên một ô hợp lệ gần khu vực đang chơi.
- **Thường:** biết hoàn thành nước thắng, chặn đối thủ và cân bằng công–thủ.
- **Khó:** ngoài các nước chiến thuật tức thời còn dùng minimax với alpha-beta
  để tính trước các lượt đáp trả.
