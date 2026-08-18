# Hướng Dẫn Vận Hành & Tổng Kết Hệ Thống AI API Reseller V4 (`apikeya`)

Dự án **AI API Reseller V4** đã được khởi tạo hoàn chỉnh tại thư mục `C:\Users\loi82\Downloads\apikeya` tuân thủ 100% theo đặc tả `ai_api_reseller_v4_executable_spec_full.md`.

---

## 1. Tóm Tắt Các Thành Phần Đã Triển Khai

### 🗄️ Database & Migrations (`supabase/`)
- `migrations/001_core.sql`: Khởi tạo 10 bảng lõi (`profiles`, `wallets`, `wallet_ledger`, `api_keys`, `providers`, `models`, `provider_models`, `api_requests`, `provider_attempts`, `topups`, `admin_audit_log`) với CHECK constraints và trigger `on_auth_user_created`.
- `migrations/002_rpc.sql`: 4 hàm RPC Security Definer atomic:
  - `reserve_api_request`: Tạm giữ số dư trước khi gọi upstream.
  - `settle_api_request`: Quyết toán chi phí theo token thực tế, hoàn trả số dư thừa.
  - `release_api_request`: Hoàn trả tiền tạm giữ khi request thất bại an toàn.
  - `apply_paid_topup`: Cộng tiền nạp + bonus tự động vào ví.
- `migrations/003_rls.sql`: Thiết lập chính sách bảo mật Row-Level Security.
- `seed.sql`: Cung cấp danh mục mô hình khởi tạo (`kimi-k2.6`, `claude-sonnet-5`, `gpt-5.6-sol`) và cấu hình định tuyến cho A6API / Neco.

### 📦 Gói Logic Nghiệp Vụ (`packages/`)
- `packages/contracts`: Định nghĩa chuẩn TypeScript cho types, DTOs, Error Codes.
- `packages/core`:
  - `money.ts`: Xử lý số học `bigint` chính xác với `microVND` và `ceilDiv`.
  - `pricing.ts`: Tính cước bán lẻ `chargeForUsage` (hỗ trợ `flat_total` và `split_io`) và giá vốn `upstreamCostForUsage`.
  - `reservation.ts`: Ước tính token đầu vào, áp dụng trần output và padding BPS.
  - `retry-policy.ts`: Phân loại lỗi failover an toàn `classifyRetry`.

### ⚡ Cổng API Gateway (`apps/gateway/`)
- Cổng Hono độc lập với các endpoint:
  - `GET /v1/models`: Danh sách model khả dụng.
  - `POST /v1/chat/completions`: Chat completion OpenAI-compatible, xác thực API Key (`ak_live_...`), định tuyến đa nguồn, hỗ trợ cả JSON & Streaming SSE với kỹ thuật stream teeing và background settlement.
  - `POST /internal/playground/chat`: Cổng nội bộ cho phiên web không cần API Key.

### 💻 Ứng Dụng Web UI (`apps/web/`)
- **Customer Portal**:
  - Landing page giới thiệu trực quan, minh bạch biểu phí VNĐ.
  - Trang Đăng nhập & Đăng ký tài khoản.
  - Trang Tổng quan Dashboard (Số dư dùng được, KPIs, lịch sử).
  - Trang Dùng thử (Playground interactive).
  - Trang Danh mục mô hình AI.
  - Trang Quản lý API Key (Cơ chế sinh key bảo mật 1-lần).
  - Trang Nạp tiền (Hỗ trợ VietQR với các gói nạp linh hoạt).
  - Trang Báo cáo chi tiêu theo từng request.
- **Admin Portal** (`/admin`):
  - Dashboard KPIs (Doanh thu bán lẻ, Giá vốn upstream, Lợi nhuận gộp Gross Margin, Đếm số lượt Ambiguous cần đối soát).
  - Quản lý danh mục Models & Tuyến Upstream (Provider Routes).
  - Bảng kiểm toán và đối soát Requests toàn hệ thống.

---

## 2. Các Bước Kích Hoạt & Sử Dụng

### Bước 1: Chạy Migrations trên Supabase
1. Mở Supabase Project Dashboard -> Vào mục **SQL Editor**.
2. Copy và chạy lần lượt 4 file:
   - `supabase/migrations/001_core.sql`
   - `supabase/migrations/002_rpc.sql`
   - `supabase/migrations/003_rls.sql`
   - `supabase/seed.sql`

### Bước 2: Điền Biến Môi Trường
1. Đổi tên `.env.example` thành `.env.local` trong `apps/web`:
   ```bash
   cp .env.example apps/web/.env.local
   ```
2. Điền `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `A6API_KEY`, `NECO_KEY`, `ADMIN_EMAILS`.

### Bước 3: Khởi Động
```bash
npm install
# Khởi động Web App
npm run dev:web
# Khởi động Gateway (Terminal khác)
npm run dev:gateway
```
Truy cập `http://localhost:3000` để trải nghiệm hệ thống!
