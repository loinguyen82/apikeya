# APIVN.tech

Developer API marketplace/gateway dùng Next.js 15, Hono trên Cloudflare Workers và Supabase/PostgreSQL.

## Product model

- Account: danh tính đăng nhập Developer Console bằng email/password.
- API Key: credential `sk-apivn-…` chỉ dùng để gọi gateway qua Bearer auth.
- Wallet: số dư microVND thuộc account và dùng chung cho mọi API Key.
- Usage: request history của API Keys và Playground thuộc account.

Flow chính: `Landing → Signup/Login → Dashboard → Create API Key → Playground → Billing → Usage`.

## Workspace

- `apps/web`: Next.js App Router cho Landing, Developer Console và `/admin`.
- `apps/gateway`: Hono gateway OpenAI-compatible (`/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/messages`).
- `packages/contracts`: TypeScript API contracts.
- `packages/core`: microVND pricing, reserve/settle và safe failover.
- `supabase/migrations`: PostgreSQL schema, RLS và financial RPCs.

## Local setup

1. Copy `.env.example` thành `apps/web/.env.local` và điền environment được phép.
2. Copy `apps/gateway/.dev.vars.example` thành `apps/gateway/.dev.vars`; không commit secret.
3. Cài dependencies và chạy:

```bash
npm install
npm run dev:web
npm run dev:gateway
```

Web chạy tại `http://localhost:3000`; Gateway chạy tại `http://localhost:8787`.

`GATEWAY_INTERNAL_TOKEN` trên Web phải khớp `INTERNAL_ADMIN_TOKEN` trên Gateway. `GATEWAY_USER_ASSERTION_SECRET` là secret riêng, giống nhau ở hai ứng dụng.

## Database

Áp migration theo thứ tự trong `supabase/migrations`. Không bỏ qua các migration financial hardening (`011`) hoặc account-centric key system (`012+`). Database không lưu raw API Key; chỉ lưu `key_prefix`, SHA-256 hash và `last_four`.

## Safety properties

- Reserve wallet trước khi dispatch; settle theo usage thật và không cho số dư âm.
- Price snapshot tại thời điểm request.
- Không retry khi kết quả upstream có thể đã bị tính phí.
- Không fake payment success; Billing chỉ mở khi `BILLING_MODE=live` và đủ PayOS secrets.
- Playground gọi cùng production gateway và ghi Usage thật.
