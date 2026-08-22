# Deploy production APIVN trên Cloudflare

Tài liệu này mô tả kiến trúc production hiện tại của nhánh `cloudflare-migration`. Hướng dẫn Vercel cũ không còn được dùng.

## Kiến trúc production

```text
https://apivn.tech
  -> Cloudflare Worker apivn-web
  -> Next.js/OpenNext

https://api.apivn.tech
  -> Cloudflare Worker ai-api-gateway
  -> Hono gateway

Hai Worker dùng chung Supabase/PostgreSQL.
Gateway gọi upstream A6API và các provider được cấu hình.
```

## 1. Chuẩn bị database

Áp dụng toàn bộ migration trong `supabase/migrations` theo thứ tự tên file, từ `001_core.sql` đến `015_add_a6_marketplace_models.sql`, sau đó chạy seed khi khởi tạo môi trường mới.

Không bỏ qua các migration financial hardening và account-centric console. Trước khi mở traffic thật, chạy các invariant trong `supabase/tests` trên môi trường được phép.

## 2. Cấu hình GitHub Actions

Repository cần các GitHub Actions secrets sau:

| Secret | Mục đích |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploy Worker và quản lý custom domain |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account chứa zone `apivn.tech` |
| `SUPABASE_ADMIN_SECRET` hoặc `SUPABASE_SECRET_KEY` hoặc `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase cho Web |
| `GATEWAY_INTERNAL_TOKEN` | Xác thực Web -> Gateway cho Playground |
| `GATEWAY_USER_ASSERTION_SECRET` | Ký user assertion giữa Web và Gateway |
| `ADMIN_EMAILS` | Danh sách email admin |
| `A6API_KEY` | API key server-side để Admin scan/cập nhật giá A6 Marketplace |
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | Bắt buộc đủ cả ba khi bật PayOS |
| `PAYMENT_WEBHOOK_SECRET` | Chỉ dùng cho webhook legacy nếu còn cần |
| `E2E_EMAIL`, `E2E_PASSWORD` | Tài khoản QA production chuyên dụng |
| `E2E_API_KEY`, `E2E_FUNDED`, `E2E_MUTATING` | Bật các bài QA có gọi thật hoặc mutation khi chủ động cho phép |

Repository variables được hỗ trợ:

| Variable | Giá trị mặc định | Mục đích |
|---|---|---|
| `PRODUCTION_WEB_URL` | `https://apivn.tech` | URL Web cho E2E |
| `PRODUCTION_GATEWAY_URL` | `https://api.apivn.tech` | URL Gateway cho E2E |
| `PRODUCTION_BILLING_MODE` | `disabled` | Đặt `live` chỉ sau khi PayOS được duyệt và đủ ba secrets |
| `CLOUDFLARE_WEB_URL` | `https://apivn.tech` | URL cho Cloudflare flow smoke |
| `LEGACY_GATEWAY_ORIGIN_IP` | IP legacy trong workflow | Chỉ dùng khi dọn DNS cũ |

Không commit secret vào `.env`, `.dev.vars`, workflow hoặc source code.

## 3. Cấu hình Gateway Worker lần đầu

Các Gateway secrets nằm trực tiếp trên Worker `ai-api-gateway`. Từ `apps/gateway`, cấu hình một lần bằng Wrangler:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put A6API_BASE_URL
npx wrangler secret put A6API_KEY

Admin price scan/update on `apivn-web` also needs the GitHub Actions secret `A6API_KEY`; the deploy workflow syncs it to the web Worker.
npx wrangler secret put INTERNAL_ADMIN_TOKEN
npx wrangler secret put GATEWAY_USER_ASSERTION_SECRET
```

`INTERNAL_ADMIN_TOKEN` phải khớp `GATEWAY_INTERNAL_TOKEN` của Web. `GATEWAY_USER_ASSERTION_SECRET` phải giống nhau ở hai Worker và phải là secret riêng.

Nếu `api.apivn.tech` còn trỏ tới origin cũ, chạy workflow `Prepare APIVN Worker Custom Domain`. Workflow chỉ xóa đúng DNS-only A record legacy đã khai báo, deploy Gateway và kiểm tra custom domain.

Sau lần chuẩn bị đầu tiên, deploy Gateway bằng workflow `Deploy APIVN Gateway to Cloudflare` hoặc:

```bash
npm run typecheck --workspace @aiapi/gateway
npm test --workspace @aiapi/gateway
npm run deploy --workspace @aiapi/gateway
```

## 4. Deploy Web Worker

Push lên nhánh `cloudflare-migration` sẽ tự động chạy:

1. Typecheck và unit tests của Web.
2. OpenNext build cho Cloudflare.
3. Đồng bộ các Web secrets có mặt trên GitHub.
4. Xác thực cấu hình Supabase, Gateway bridge và PayOS.
5. Gắn commit SHA vào `/api/version`.
6. Deploy Worker `apivn-web` lên `apivn.tech`.

Có thể chạy thủ công workflow `Deploy APIVN Web to Cloudflare` khi cần redeploy cùng commit.

## 5. Bật hoặc khóa thanh toán

Production mặc định fail-closed với `PRODUCTION_BILLING_MODE=disabled`. Ở chế độ này UI không tạo QR giả và không giả lập giao dịch thành công.

Chỉ chuyển repository variable `PRODUCTION_BILLING_MODE` sang `live` khi:

- PayOS đã duyệt tài khoản production.
- Cả ba secrets `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` đã được cấu hình đúng.
- Webhook production đã trỏ về endpoint của APIVN.
- Một giao dịch giá trị nhỏ đã được đối soát end-to-end trên tài khoản test.

Workflow sẽ từ chối bật `live` nếu thiếu bất kỳ PayOS secret nào.

## 6. Xác minh sau deploy

Các endpoint tối thiểu phải trả `200`:

```bash
curl https://apivn.tech/api/health
curl https://apivn.tech/api/version
curl https://api.apivn.tech/healthz
curl https://api.apivn.tech/v1/models
```

`/api/version` phải chứa đúng `revision` bằng commit SHA vừa deploy. Workflow `Production E2E` chờ chính SHA này trước khi chạy Playwright, nên không thể báo xanh bằng cách kiểm tra nhầm bản deploy trước đó.

Ở chế độ an toàn hiện tại, `/api/health` trả `paymentMode: "disabled"`. Khi chủ động bật billing, giá trị phải là `payos`.

## 7. Hoàn tất migration khỏi Vercel

GitHub có thể vẫn nhận các commit status từ những Vercel project cũ dù Cloudflare đã deploy thành công. Sau khi xác nhận Cloudflare ổn định:

1. Vào từng Vercel project cũ của repository `apikeya`.
2. Gỡ Git integration hoặc archive project không còn dùng.
3. Kiểm tra PR chỉ còn các Cloudflare/PR checks hiện hành.
4. Chuyển PR khỏi Draft và merge vào `main` khi toàn bộ required checks xanh.

Không bỏ qua branch protection hoặc push thẳng vào `main` chỉ để né status từ integration cũ.
