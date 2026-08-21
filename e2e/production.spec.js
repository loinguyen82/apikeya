import { test, expect } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'https://apikeya.vercel.app'
const gatewayURL = process.env.GATEWAY_URL || 'https://ai-api-gateway.loi822004.workers.dev'
const e2eEmail = process.env.E2E_EMAIL || ''
const e2ePassword = process.env.E2E_PASSWORD || ''
const funded = process.env.E2E_FUNDED === 'true'
const allowMutations = process.env.E2E_MUTATING === 'true'

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(e2eEmail)
  await page.getByLabel('Mật khẩu').fill(e2ePassword)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 30000 })
}

test.describe('Apikeya production public contract', () => {
  test('landing, pricing, docs and auth pages render', async ({ page }) => {
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await expect(page.getByText('Apikeya').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /một api cho nhiều model/i })).toBeVisible()
    await expect(page.getByText('150đ / 1M')).toBeVisible()
    await expect(page.getByText('600đ / 1M')).toBeVisible()
    await expect(page.getByText('2.500đ / 1M')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('🥕')
    await expect(page.locator('body')).toContainText('OPENAI_API_KEY=sk-...')

    await page.goto(`${baseURL}/docs`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /tích hợp bằng api chuẩn openai/i })).toBeVisible()
    await expect(page.locator('body')).toContainText(`${gatewayURL}/v1`)
    await expect(page.locator('body')).not.toContainText('$https://')

    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /đăng nhập/i })).toBeVisible()

    await page.goto(`${baseURL}/signup`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /tạo tài khoản/i })).toBeVisible()
    await expect(page.locator('body')).toContainText('Dùng email thật để nhận link xác minh')
  })

  test('anonymous dashboard is protected', async ({ page }) => {
    await page.goto(`${baseURL}/dashboard`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated mutations and payment webhook are rejected', async ({ request }) => {
    const keyRes = await request.post(`${baseURL}/api/keys`, { data: { name: 'unauthorized' } })
    expect(keyRes.status()).toBe(401)

    const topupRes = await request.post(`${baseURL}/api/topups`, {
      form: { amount: '20000' },
      headers: { origin: baseURL },
    })
    expect(topupRes.status()).toBe(401)

    const webhookRes = await request.post(`${baseURL}/api/payment-webhook`, {
      data: { paid: true, topup_id: '00000000-0000-0000-0000-000000000000', external_id: 'e2e' },
    })
    expect(webhookRes.status()).toBe(401)
  })
})

test.describe('Apikeya authenticated journey', () => {
  test.skip(!e2eEmail || !e2ePassword, 'Set E2E_EMAIL and E2E_PASSWORD as GitHub Actions secrets to run authenticated E2E.')

  test('login and all customer surfaces render', async ({ page }) => {
    await login(page)
    for (const path of ['/dashboard', '/dashboard/billing', '/dashboard/playground', '/dashboard/models', '/dashboard/api-keys', '/dashboard/usage']) {
      await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
      await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/')))
      await expect(page.locator('body')).not.toContainText('Application error')
      await expect(page.locator('body')).not.toContainText('🥕')
    }
  })

  test('API key is created once, exposed once, then revoked', async ({ page }) => {
    await login(page)
    await page.goto(`${baseURL}/dashboard/api-keys`, { waitUntil: 'networkidle' })
    await page.getByLabel('Tên key').fill(`E2E ${Date.now()}`)
    await page.getByRole('button', { name: 'Tạo API key' }).click()
    await expect(page.getByText('Lưu secret trước khi đóng')).toBeVisible({ timeout: 15000 })
    const secret = (await page.locator('.secret-box code').textContent())?.trim() || ''
    expect(secret.startsWith('sk-')).toBeTruthy()

    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Thu hồi' }).first().click()
    await expect(page.getByText('Revoked').first()).toBeVisible({ timeout: 15000 })
  })

  test('billing exposes the 20k entry package', async ({ page }) => {
    await login(page)
    await page.goto(`${baseURL}/dashboard/billing`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /nạp số dư bằng vietqr/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /20\.000/ })).toBeVisible()
    await expect(page.locator('body')).toContainText('Chờ đối soát')
  })

  test('optional topup mutation creates a real pending QR request', async ({ page }) => {
    test.skip(!allowMutations, 'Set E2E_MUTATING=true only for a dedicated test account.')
    await login(page)
    await page.goto(`${baseURL}/dashboard/billing`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /20\.000/ }).click()
    await page.getByRole('button', { name: /Tạo mã VietQR/ }).click()
    await page.waitForURL(/\/dashboard\/billing\?topup=/, { timeout: 15000 })
    await expect(page.getByAltText('Mã VietQR nạp tiền')).toBeVisible()
    await expect(page.locator('body')).toContainText('Nội dung bắt buộc')
  })

  test('optional funded flow returns a real model response and direct API response', async ({ page, request }) => {
    test.skip(!funded, 'Set E2E_FUNDED=true only when the dedicated E2E wallet has credit.')
    await login(page)

    await page.goto(`${baseURL}/dashboard/playground?model=kimi-k2.6`, { waitUntil: 'networkidle' })
    await page.getByLabel('Prompt').fill('Trả lời đúng một từ: OK')
    await page.getByRole('button', { name: 'Gửi' }).click()
    await expect(page.locator('.message.assistant').last()).toBeVisible({ timeout: 45000 })
    await expect(page.locator('.receipt')).toBeVisible({ timeout: 45000 })
    await expect(page.locator('.notice.danger')).toHaveCount(0)

    await page.goto(`${baseURL}/dashboard/api-keys`, { waitUntil: 'networkidle' })
    await page.getByLabel('Tên key').fill(`E2E gateway ${Date.now()}`)
    await page.getByRole('button', { name: 'Tạo API key' }).click()
    await expect(page.getByText('Lưu secret trước khi đóng')).toBeVisible({ timeout: 15000 })
    const secret = (await page.locator('.secret-box code').textContent())?.trim() || ''

    const apiRes = await request.post(`${gatewayURL}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      data: { model: 'kimi-k2.6', messages: [{ role: 'user', content: 'Reply with OK only' }] },
      timeout: 60000,
    })
    expect(apiRes.ok()).toBeTruthy()
    const body = await apiRes.json()
    expect(body?.choices?.[0]?.message?.content).toBeTruthy()

    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Thu hồi' }).first().click()
    await expect(page.getByText('Revoked').first()).toBeVisible({ timeout: 15000 })
  })
})
