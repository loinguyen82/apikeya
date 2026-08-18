# Kế Hoạch Triển Khai Chi Tiết: AI API Reseller V4

> **Căn cứ đặc tả:** `ai_api_reseller_v4_executable_spec_full.md` và `ai_api_reseller_v4_executable_spec.docx`.  
> **Thư mục mục tiêu:** `C:\Users\loi82\Downloads\apikeya`  
> **Dự án gốc tham chiếu:** `C:\Users\loi82\Downloads\a6-vietapi-mvp`

---

## 1. Tổng Quan & Mục Tiêu Dự Án

Hệ thống **AI API Reseller V4** là cổng trung gian (API Gateway) thương mại hóa dịch vụ AI dành cho thị trường Việt Nam:
- **Đơn vị tiền tệ chính xác:** Sử dụng số nguyên `microVND` (`1 VND = 1.000 microVND`), tuyệt đối không dùng số thực (float) cho tính toán tài chính.
- **Cơ chế thanh toán 2 pha (Two-phase Billing):**
  1. *Reservation (`reserve_api_request`):* Tạm giữ tiền trong ví khả dụng (`available_micros -> reserved_micros`) trước khi gửi request tới upstream.
  2. *Settlement (`settle_api_request`):* Quyết toán dựa trên số token thực tế do upstream trả về, hoàn trả số tiền thừa về ví hoặc thu thêm trong hạn mức ví, tránh ví bị âm.
  3. *Release (`release_api_request`):* Hoàn trả 100% tiền tạm giữ khi request thất bại mà chắc chắn không bị nhà cung cấp tính phí.
  4. *Reconciliation (`failed_ambiguous`):* Đóng băng trạng thái nếu xảy ra timeout/ngắt kết nối để đối soát thủ công/RPC, cấm retry tự động gây trùng lặp chi phí upstream.
- **Kiến trúc Monorepo tiêu chuẩn:**
  - `packages/contracts`: Kiểu dữ liệu, giao thức, mã lỗi dùng chung.
  - `packages/core`: Logic tính tiền, quy đổi tiền tệ, ước tính token, chính sách retry thuần túy (pure functions, zero dependency).
  - `apps/gateway`: Gateway siêu tốc (Hono framework) xử lý định tuyến OpenAI-compatible, xác thực SHA-256 API Key, xử lý SSE stream song song với metering.
  - `apps/web`: Ứng dụng Next.js 16 App Router giao diện khách hàng & quản trị viên.
  - `supabase/migrations`: Cơ sở dữ liệu PostgreSQL, RLS, và các hàm RPC bảo mật (`SECURITY DEFINER`).

---

## 2. So Sánh Dự Án Gốc (`a6-vietapi-mvp`) và Bản Nâng Cấp V4 (`apikeya`)

| Thành phần | Dự án Gốc (`a6-vietapi-mvp`) | Bản Chuẩn V4 (`apikeya`) |
|---|---|---|
| **Mô hình kiến trúc** | Next.js Monolith đơn lẻ | **Monorepo đa tầng** (`packages/contracts`, `packages/core`, `apps/gateway`, `apps/web`) |
| **Đơn vị tiền tệ** | VNĐ / 1M token (làm tròn số nguyên) | **microVND (1 VNĐ = 1.000 microVND, `bigint`)** + hỗ trợ cả `flat_total` và `split_io` |
| **Khóa & Giữ tiền** | Request lease đơn giản + trừ sau | **Atomic Pre-dispatch Reservation** + **Post-stream Settlement** an toàn tuyệt đối |
| **Giá lịch sử** | Snapshot cơ bản | **Bắt buộc Price Snapshots** trên `api_requests` và `provider_attempts` (Đổi giá trong admin không làm sai lệch lịch sử) |
| **Đa nhà cung cấp** | 1 nguồn A6API | **Đa nguồn (A6API, Neco, v.v.)** với thứ tự ưu tiên (`priority`), failover an toàn (`classifyRetry`), ghi vết từng attempt |
| **Xử lý sự cố Upstream** | Lỗi là hủy/trả lỗi | Phân loại `SafeFailure` (cho phép thử route tiếp) vs `AmbiguousFailure` (giữ reserve, cấm retry tự động) |
| **Trải nghiệm Người dùng** | Tài liệu -> Tạo key -> Nạp tiền | **Dùng thử (Playground) -> Nạp tiền -> Tạo API key** (VND-first, đơn giản, trực quan) |

---

## 3. Cấu Trúc File & Thư Mục Đầy Đủ Trong `apikeya`

```text
apikeya/
├── package.json
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── README.md
│
├── packages/
│   ├── contracts/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   │
│   └── core/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── money.ts
│           ├── pricing.ts
│           ├── reservation.ts
│           └── retry-policy.ts
│
├── apps/
│   ├── gateway/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── wrangler.jsonc
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── env.ts
│   │   │   ├── middleware/
│   │   │   │   └── api-key.ts
│   │   │   ├── routes/
│   │   │   │   ├── models.ts
│   │   │   │   ├── chat.ts
│   │   │   │   └── internal-playground.ts
│   │   │   ├── application/
│   │   │   │   ├── catalog.ts
│   │   │   │   ├── billing.ts
│   │   │   │   ├── validate-chat.ts
│   │   │   │   └── execute-chat.ts
│   │   │   ├── providers/
│   │   │   │   ├── types.ts
│   │   │   │   └── openai-compatible.ts
│   │   │   ├── repositories/
│   │   │   │   └── supabase.ts
│   │   │   └── utils/
│   │   │       ├── crypto.ts
│   │   │       └── id.ts
│   │   └── test/
│   │       ├── pricing.test.ts
│   │       └── retry-policy.test.ts
│   │
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── proxy.ts
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── globals.css
│       │   │   ├── page.tsx
│       │   │   ├── login/page.tsx
│       │   │   ├── signup/page.tsx
│       │   │   ├── docs/page.tsx
│       │   │   ├── dashboard/
│       │   │   │   ├── layout.tsx
│       │   │   │   ├── page.tsx
│       │   │   │   ├── playground/page.tsx
│       │   │   │   ├── models/page.tsx
│       │   │   │   ├── api-keys/page.tsx
│       │   │   │   ├── billing/page.tsx
│       │   │   │   └── usage/page.tsx
│       │   │   ├── admin/
│       │   │   │   ├── layout.tsx
│       │   │   │   ├── page.tsx
│       │   │   │   ├── models/page.tsx
│       │   │   │   └── requests/page.tsx
│       │   │   └── api/
│       │   │       ├── keys/route.ts
│       │   │       ├── topups/route.ts
│       │   │       ├── playground/route.ts
│       │   │       └── payment-webhook/route.ts
│       │   ├── components/
│       │   │   ├── AppShell.tsx
│       │   │   └── PlaygroundClient.tsx
│       │   └── lib/
│       │       ├── auth.ts
│       │       ├── admin.ts
│       │       ├── money.ts
│       │       └── supabase/
│       │           ├── server.ts
│       │           ├── admin.ts
│       │           └── proxy.ts
│       └── public/
│
└── supabase/
    ├── migrations/
    │   ├── 001_core.sql
    │   ├── 002_rpc.sql
    │   └── 003_rls.sql
    └── seed.sql
```

---

## 4. Các Giai Đoạn Thực Hiện

### Bước 1: Khởi tạo Cấu trúc Monorepo & Configuration
- Tạo cấu trúc thư mục, root `package.json` định nghĩa workspaces.
- Tạo các file cấu hình TypeScript: `tsconfig.base.json`, `tsconfig.json` cho từng package/app.
- Cung cấp file `.env.example` và tài liệu hướng dẫn `README.md`.

### Bước 2: Xây dựng Cơ sở dữ liệu Supabase
- Tạo file migration `supabase/migrations/001_core.sql`: Chứa cấu trúc bảng `profiles`, `wallets`, `wallet_ledger`, `api_keys`, `providers`, `models`, `provider_models`, `api_requests`, `provider_attempts`, `topups`, `admin_audit_log`.
- Tạo file migration `supabase/migrations/002_rpc.sql`: Cài đặt các hàm atomic: `reserve_api_request`, `settle_api_request`, `release_api_request`, `apply_paid_topup`.
- Tạo file migration `supabase/migrations/003_rls.sql`: Kích hoạt RLS và các chính sách phân quyền cho người dùng và quản trị viên.
- Tạo file `supabase/seed.sql`: Cung cấp danh mục mô hình khởi tạo và định tuyến mẫu.

### Bước 3: Triển khai Packages Lõi (`packages/contracts` & `packages/core`)
- Xây dựng `@aiapi/contracts` chứa toàn bộ interface và type định nghĩa chuẩn.
- Xây dựng `@aiapi/core` xử lý logic tính tiền `money.ts`, `pricing.ts`, ước tính `reservation.ts`, và phân loại lỗi failover `retry-policy.ts`.

### Bước 4: Triển khai Cổng API Gateway (`apps/gateway`)
- Xây dựng ứng dụng Hono độc lập.
- Cài đặt middleware xác thực `api-key.ts`.
- Cài đặt orchestrator `execute-chat.ts` hoàn chỉnh (kết hợp `catalog.ts`, `billing.ts`, `openai-compatible.ts`).
- Hỗ trợ các endpoint: `GET /v1/models`, `POST /v1/chat/completions`, và `POST /internal/playground/chat`.

### Bước 5: Triển khai Giao Diện Web Khách Hàng & Quản Trị (`apps/web`)
- Xây dựng giao diện Next.js 16 với styling chuẩn đẹp, hiện đại.
- Thiết kế hệ thống trang Khách hàng (Tổng quan, Dùng thử Playground, Mô hình, API Key 1-lần, Nạp tiền VietQR, Lịch sử Chi tiêu).
- Thiết kế hệ thống trang Quản trị `/admin` (Thống kê KPIs, Báo cáo Doanh thu/Lợi nhuận gộp, Quản lý Models & Routes, Đối soát Requests).
- Cài đặt các API Routes xử lý backend trong Next.js.

### Bước 6: Kiểm thử & Nghiệm thu
- Kiểm tra toàn bộ mã nguồn, chạy typecheck đảm bảo không có lỗi type.
- Kiểm tra luồng dữ liệu, tính toàn vẹn của các ràng buộc nghiệp vụ.
