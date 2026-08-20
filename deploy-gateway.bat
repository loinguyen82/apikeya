@echo off
echo ============================================
echo   DEPLOY AI API GATEWAY TO CLOUDFLARE WORKERS
echo ============================================
echo.

cd /d "%~dp0apps\gateway"

echo [1/3] Dang login vao Cloudflare...
npx wrangler login

echo.
echo [2/3] Dang set secrets (nhap tung gia tri khi duoc hoi)...
echo --- SUPABASE_URL ---
npx wrangler secret put SUPABASE_URL
echo --- SUPABASE_SERVICE_ROLE_KEY ---
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
echo --- A6API_BASE_URL ---
npx wrangler secret put A6API_BASE_URL
echo --- A6API_KEY ---
npx wrangler secret put A6API_KEY
echo --- NECO_BASE_URL ---
npx wrangler secret put NECO_BASE_URL
echo --- NECO_KEY ---
npx wrangler secret put NECO_KEY
echo --- INTERNAL_ADMIN_TOKEN ---
npx wrangler secret put INTERNAL_ADMIN_TOKEN
echo --- GATEWAY_USER_ASSERTION_SECRET ---
npx wrangler secret put GATEWAY_USER_ASSERTION_SECRET

echo.
echo [3/3] Dang deploy Gateway...
npx wrangler deploy

echo.
echo ============================================
echo   DEPLOY XONG! URL cua Gateway se hien o tren.
echo   VD: https://ai-api-gateway.xxx.workers.dev
echo   Hay copy URL nay de cau hinh cho Vercel.
echo ============================================
pause
