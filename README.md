# AI API Reseller V4

Cổng trung gian (API Gateway) thương mại hóa dịch vụ AI dành cho thị trường Việt Nam: Next.js 16 + Hono Gateway + Supabase + Đa nhà cung cấp (A6API, Neco).

## Cấu trúc Hệ thống

- `packages/contracts`: Định nghĩa chuẩn TypeScript cho toàn bộ hợp đồng API, models, và error codes.
- `packages/core`: Xử lý tính toán tiền tệ `microVND` (`1 VND = 1.000 microVND`), công thức tính cước, tính tiền tạm giữ trước khi gọi upstream, và chính sách failover an toàn.
- `apps/gateway`: Cổng API Gateway siêu tốc sử dụng Hono (tương thích Cloudflare Workers / Node.js), định tuyến đa nguồn, xác thực SHA-256 API Key, xử lý SSE streaming song song với metering.
- `apps/web`: Ứng dụng web Next.js 16 App Router cho Khách hàng (Playground, Nạp tiền VietQR, Quản lý Key, Báo cáo chi tiêu) và Quản trị viên (Báo cáo Doanh thu/Lợi nhuận gộp, Quản lý bảng giá, Đối soát giao dịch).
- `supabase/migrations`: Cơ sở dữ liệu PostgreSQL, RLS, và các hàm RPC bảo mật (`SECURITY DEFINER`).

## Hướng dẫn Thiết lập & Chạy

### 1. Khởi tạo Cơ sở Dữ liệu Supabase
Mở SQL Editor trên Supabase Dashboard và chạy lần lượt:
1. `supabase/migrations/001_core.sql`
2. `supabase/migrations/002_rpc.sql`
3. `supabase/migrations/003_rls.sql`
4. `supabase/seed.sql`

### 2. Cấu hình Môi trường
Sao chép `.env.example` thành `.env.local` trong `apps/web` và điền các thông tin:
```bash
cp .env.example apps/web/.env.local
```

### 3. Cài đặt & Chạy Local
```bash
npm install
# Chạy Web App (Next.js)
npm run dev:web
# Chạy Gateway (Hono)
npm run dev:gateway
```
- Web App: `http://localhost:3000`
- Gateway: `http://localhost:8787`

## Tính năng Nổi bật V4
- **Two-phase Billing:** Tạm giữ tiền trước (`reserve_api_request`) -> Dispatch -> Quyết toán thực tế (`settle_api_request`) -> Không bao giờ âm ví.
- **Price Snapshots:** Đóng băng giá vốn và giá bán tại thời điểm request, đảm bảo kiểm toán lịch sử chính xác kể cả khi admin đổi bảng giá.
- **Safe Failover:** Chỉ tự động chuyển sang nhà cung cấp dự phòng khi lỗi được xác nhận an toàn (không bị tính phí); cấm retry khi xảy ra timeout/ngắt mạng.
- **VND-first Experience:** Giao diện trực quan, người dùng có thể Dùng thử trực tiếp trên web trước khi cần tạo API Key.
