# Hướng Dẫn Deploy Live — AI API Reseller V4

## Tổng Quan Kiến Trúc Production

```
                        Internet
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
    ┌──────────────────┐   ┌──────────────────────┐
    │   Vercel (Free)  │   │  Cloudflare Workers   │
    │   Next.js Web    │   │  Hono API Gateway     │
    │   *.vercel.app   │   │  *.workers.dev        │
    └────────┬─────────┘   └───────────┬───────────┘
             │                         │
             └──────────┬──────────────┘
                        ▼
              ┌──────────────────┐
              │  Supabase Cloud  │
              │  PostgreSQL + Auth│
              └──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  A6API Upstream  │
              │  (AI Models)     │
              └──────────────────┘
```

---

## Bước 1: Deploy Gateway lên Cloudflare Workers

### Cách 1: Chạy script tự động (Khuyên dùng)
Double-click file `deploy-gateway.bat` tại thư mục gốc.
Script sẽ tự hỏi bạn nhập từng secret.

### Cách 2: Chạy thủ công
```bash
cd apps/gateway
npx wrangler login
```
Trình duyệt mở ra → Đăng nhập Cloudflare (tạo tài khoản free nếu chưa có).

Set secrets (nhập từng giá trị khi được hỏi):
```bash
npx wrangler secret put SUPABASE_URL
# Nhập Supabase Project URL của bạn

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Nhập Supabase Service Role Secret Key của bạn

npx wrangler secret put A6API_BASE_URL
# Nhập URL của A6API: https://api.a6api.com/v1

npx wrangler secret put A6API_KEY
# Nhập API key của A6API

npx wrangler secret put NECO_BASE_URL
# Nhập: (Enter trống nếu chưa dùng)

npx wrangler secret put NECO_KEY
# Nhập: (Enter trống nếu chưa dùng)

npx wrangler secret put INTERNAL_ADMIN_TOKEN
# Nhập mã token nội bộ giữa Gateway và Web

npx wrangler secret put GATEWAY_USER_ASSERTION_SECRET
# Secret riêng để Gateway xác thực user do Web chuyển tiếp cho playground
```

Deploy:
```bash
npx wrangler deploy
```

> ✅ Sau khi deploy xong, bạn sẽ nhận được URL dạng:
> `https://ai-api-gateway.YOUR_SUBDOMAIN.workers.dev`
> **Copy URL này lại**, sẽ dùng ở Bước 2.

---

## Bước 2: Deploy Web lên Vercel

### 2.1. Push code lên GitHub
```bash
cd C:\Users\loi82\Downloads\apikeya
git init
git add .
git commit -m "AI API Reseller V4 - Initial"
```
Tạo repo trên GitHub (public hoặc private), rồi:
```bash
git remote add origin https://github.com/YOUR_USERNAME/apikeya.git
git branch -M main
git push -u origin main
```

### 2.2. Import vào Vercel
1. Vào [vercel.com/new](https://vercel.com/new) → Import Git Repository → Chọn repo `apikeya`.
2. Giữ **Root Directory** ở thư mục gốc repository. `vercel.json` đã chỉ định build workspace `@aiapi/web` và output `apps/web/.next`.
3. Tại mục **Environment Variables**, thêm các biến sau:

| Key | Value (Lấy từ file config riêng của bạn) |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |
| `NEXT_PUBLIC_GATEWAY_BASE_URL` | `https://ai-api-gateway.YOUR_SUBDOMAIN.workers.dev` ← URL từ Bước 1 |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR_PROJECT.vercel.app` ← Vercel sẽ cho URL sau khi deploy |
| `GATEWAY_INTERNAL_TOKEN` | Token nội bộ bí mật |
| `GATEWAY_USER_ASSERTION_SECRET` | Phải giống secret `GATEWAY_USER_ASSERTION_SECRET` trên Gateway |
| `ADMIN_EMAILS` | Email admin của bạn (vd: loi822004@gmail.com) |
| `A6API_KEY` | API key A6API dùng cho admin live balance/sync |
| `PAYMENT_WEBHOOK_SECRET` | Secret dùng để tạo HMAC `sha256=<hex(raw body)>` cho webhook |
| `ENABLE_SIGNUP_TRIAL_CREDIT` | Để `false` hoặc bỏ trống trong production. Chỉ bật `true` khi đã có chống abuse và muốn cấp credit signup. |
| `DISABLE_EMAIL_CONFIRMATION` | Chỉ đặt `true` ở local/dev đã kiểm soát. Production phải bỏ trống để bắt buộc xác minh email. |

4. Nhấn **Deploy** → Đợi 1-2 phút.

> ✅ Sau khi deploy xong, bạn sẽ có URL dạng:
> `https://apikeya.vercel.app` hoặc `https://apikeya-xxx.vercel.app`

---

## Bước 3: Cập nhật Supabase Auth cho Production

Vào [Supabase Dashboard](https://supabase.com/dashboard/project/ycrqwekkafexqnlxpczd) → **Authentication** → **URL Configuration**:

| Cài đặt | Giá trị |
|---|---|
| Site URL | `https://YOUR_PROJECT.vercel.app` |
| Redirect URLs | `https://YOUR_PROJECT.vercel.app/**` |

> ⚠️ Nếu không cập nhật Site URL, Supabase sẽ chặn login/signup trên production.

---

## Bước 4: Kiểm Tra Hệ Thống Live

1. Mở `https://YOUR_PROJECT.vercel.app` → Đăng ký tài khoản bằng `loi822004@gmail.com`.
2. Vào Dashboard → Thử Playground.
3. Kiểm tra Gateway: `https://ai-api-gateway.YOUR_SUBDOMAIN.workers.dev/healthz` → Phải trả về `{"ok":true}`.
4. Kiểm tra API trực tiếp:
```bash
curl https://ai-api-gateway.YOUR_SUBDOMAIN.workers.dev/v1/models
```

### Kiểm tra chống lạm dụng trước khi mở public

- Chạy migration `006_abuse_hardening.sql` để mỗi user chỉ có một đơn nạp pending.
- Giữ `ENABLE_SIGNUP_TRIAL_CREDIT` tắt trong production; nếu bật, phải đặt rate limit signup/trial ở Vercel/Cloudflare hoặc một dịch vụ lưu trạng thái dùng chung.
- Cấu hình rate limit theo IP, user và API key ở edge. Không dùng biến memory trong Next.js hoặc Worker làm rate limiter vì instance có thể scale độc lập.
- Kiểm tra `Origin` của các mutation cookie-authenticated và giữ auth cookie ở `SameSite=Lax` hoặc chặt hơn.

---

## Tóm Tắt Chi Phí

| Dịch vụ | Gói | Chi phí |
|---|---|---|
| Supabase | Free tier | $0/tháng (500MB DB, 50k MAU) |
| Vercel | Hobby | $0/tháng (100GB bandwidth) |
| Cloudflare Workers | Free tier | $0/tháng (100k requests/ngày) |
| **Tổng** | | **$0/tháng** |

Khi traffic tăng, chỉ cần nâng gói Cloudflare Workers ($5/tháng cho 10M requests) và Vercel Pro ($20/tháng).
