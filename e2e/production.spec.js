import { test, expect } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'https://apivn.tech'
const gatewayURL = process.env.GATEWAY_URL || 'https://api.apivn.tech'
const e2eApiKey = process.env.E2E_API_KEY || ''
const e2eEmail = process.env.E2E_EMAIL || ''
const e2ePassword = process.env.E2E_PASSWORD || ''
const funded = process.env.E2E_FUNDED === 'true'
const allowMutations = process.env.E2E_MUTATING === 'true'

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(e2eEmail)
  await page.getByLabel('Mật khẩu').fill(e2ePassword)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 30000 })
}

test.describe('APIVN public contract', () => {
  test('deployed revision exposes account-centric console contract', async ({ request }) => {
    const version = await request.get(`${baseURL}/api/version`)
    expect(version.status()).toBe(200)
    expect((await version.json())?.version).toBe('developer-console-v1')
    const health = await request.get(`${baseURL}/api/health`)
    expect(health.status()).toBe(200)
    expect((await health.json())?.paymentMode).toBe('disabled')
  })

  test('landing, docs and account auth render', async ({ page }) => {
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /Một API/i })).toBeVisible()
    await expect(page.locator('body')).toContainText(`${gatewayURL}/v1`)
    await expect(page.locator('body')).toContainText('Thanh toán VNĐ')
    await page.goto(`${baseURL}/docs`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /tích hợp bằng api chuẩn openai/i })).toBeVisible()
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeVisible()
    await expect(page.getByLabel('API key')).toHaveCount(0)
  })

  test('API Key cannot create a Dashboard session', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/auth/login`, { data: { apiKey: 'sk-apivn-not-a-session-token' }, headers: { origin: baseURL } })
    expect(response.status()).toBe(400)
  })

  test('anonymous dashboard and mutations are protected', async ({ page, request }) => {
    await page.goto(`${baseURL}/dashboard`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/login/)
    const keyResponse = await request.post(`${baseURL}/api/keys`, { data: { name: 'unauthorized' }, headers: { origin: baseURL } })
    expect(keyResponse.status()).toBe(401)
  })
})

test.describe('APIVN authenticated journey', () => {
  test.skip(!e2eEmail || !e2ePassword, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated E2E.')

  test('Developer Console routes render after email login', async ({ page }) => {
    await login(page)
    for (const path of ['/dashboard', '/dashboard/models', '/dashboard/api-keys', '/dashboard/playground', '/dashboard/usage', '/dashboard/billing', '/dashboard/settings']) {
      await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
      await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/')))
      await expect(page.locator('body')).not.toContainText('Application error')
    }
  })

  test('disabled Billing never exposes a fake success action', async ({ page }) => {
    await login(page)
    await page.goto(`${baseURL}/dashboard/billing`, { waitUntil: 'networkidle' })
    await expect(page.getByText('PayOS chưa cấu hình')).toBeVisible()
    await expect(page.getByText(/không tạo QR giả/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mô phỏng đã thanh toán' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Nạp tiền', exact: true })).toBeDisabled()
  })

  test('optional create-once secret, revoke and gateway rejection flow', async ({ page, request }) => {
    test.skip(!allowMutations, 'Use a dedicated account with E2E_MUTATING=true.')
    await login(page)
    await page.goto(`${baseURL}/dashboard/api-keys`, { waitUntil: 'networkidle' })
    const name = `E2E ${Date.now()}`
    await page.getByLabel('Tên key').fill(name)
    await page.getByRole('button', { name: 'Create API Key' }).click()
    const secret = (await page.getByTestId('new-api-key').textContent())?.trim() || ''
    expect(secret).toMatch(/^sk-apivn-[A-Za-z0-9_-]{20,}$/)
    await page.getByRole('button', { name: 'Tôi đã lưu' }).click()
    const row = page.getByRole('row').filter({ hasText: name })
    page.once('dialog', (dialog) => dialog.accept())
    await row.getByRole('button', { name: 'Revoke' }).click()
    await expect(row.getByText('Revoked')).toBeVisible()
    const rejected = await request.post(`${gatewayURL}/v1/chat/completions`, { headers: { authorization: `Bearer ${secret}` }, data: { model: 'kimi-k2.6', messages: [{ role: 'user', content: 'OK' }] } })
    expect(rejected.status()).toBe(401)
    expect((await rejected.json())?.error?.code).toBe('api_key_revoked')
  })

  test('optional funded Playground and gateway request are real', async ({ page, request }) => {
    test.skip(!funded || !e2eApiKey, 'Set E2E_FUNDED=true and E2E_API_KEY for a funded account.')
    await login(page)
    await page.goto(`${baseURL}/dashboard/playground?model=kimi-k2.6`, { waitUntil: 'networkidle' })
    await page.getByLabel('Prompt').fill('Trả lời đúng một từ: OK')
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.locator('.playground-response')).not.toContainText('Response sẽ xuất hiện', { timeout: 45000 })
    await expect(page.locator('.receipt-metrics')).toBeVisible({ timeout: 45000 })
    const response = await request.post(`${gatewayURL}/v1/chat/completions`, { headers: { authorization: `Bearer ${e2eApiKey}` }, data: { model: 'kimi-k2.6', messages: [{ role: 'user', content: 'Reply OK' }] }, timeout: 60000 })
    expect(response.ok()).toBeTruthy()
  })
})
