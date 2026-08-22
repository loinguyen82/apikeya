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
  if (e2eApiKey) {
    await page.getByLabel('API key').fill(e2eApiKey)
    await page.getByRole('button', { name: 'Vào Dashboard' }).click()
  } else {
    await page.getByRole('button', { name: /Tài khoản cũ chưa có key/i }).click()
    await page.getByLabel('Email').fill(e2eEmail)
    await page.getByLabel('Mật khẩu').fill(e2ePassword)
    await page.getByRole('button', { name: 'Đăng nhập cũ' }).click()
  }
  await page.waitForURL(/\/dashboard/, { timeout: 30000 })
}

async function legacyLogin(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Tài khoản cũ chưa có key/i }).click()
  await page.getByLabel('Email').fill(e2eEmail)
  await page.getByLabel('Mật khẩu').fill(e2ePassword)
  await page.getByRole('button', { name: 'Đăng nhập cũ' }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 30000 })
}

test.describe('Apikeya production public contract', () => {
  test('deployed revision matches the current 1k/payOS contract', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/version`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body?.service).toBe('apivn-web')
    expect(body?.version).toBe('payos-1k-v1')
  })

  test('landing, pricing, docs and key-first auth pages render', async ({ page }) => {
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await expect(page.getByText('Apikeya').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /một api cho nhiều model/i })).toBeVisible()
    await expect(page.getByText('150đ / 1M')).toBeVisible()
    await expect(page.getByText('600đ / 1M')).toBeVisible()
    await expect(page.getByText('2.500đ / 1M')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('🥕')
    await expect(page.locator('body')).toContainText('OPENAI_API_KEY=sk-...')
    await expect(page.locator('body')).toContainText('1 user · 1 key active')

    await page.goto(`${baseURL}/docs`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /tích hợp bằng api chuẩn openai/i })).toBeVisible()
    await expect(page.locator('body')).toContainText(`${gatewayURL}/v1`)
    await expect(page.locator('body')).not.toContainText('$https://')

    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /đăng nhập bằng api key/i })).toBeVisible()
    await expect(page.getByLabel('API key')).toBeVisible()

    await page.goto(`${baseURL}/signup`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /nhận api key/i })).toBeVisible()
    await expect(page.locator('body')).toContainText('Không cần xác minh email')
  })

  test('invalid API key is rejected', async ({ request }) => {
    const res = await request.post(`${baseURL}/api/auth/login`, {
      data: { apiKey: 'sk-invalid-e2e-key-not-valid' },
      headers: { origin: baseURL },
    })
    expect(res.status()).toBe(401)
  })

  test('anonymous dashboard is protected', async ({ page }) => {
    await page.goto(`${baseURL}/dashboard`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated mutations and payment webhook are rejected', async ({ request }) => {
    const keyRes = await request.post(`${baseURL}/api/keys`, { data: { name: 'unauthorized' }, headers: { origin: baseURL } })
    expect(keyRes.status()).toBe(401)

    const topupRes = await request.post(`${baseURL}/api/topups`, {
      form: { amount: '1000' },
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
  test.skip(!e2eApiKey && (!e2eEmail || !e2ePassword), 'Set E2E_API_KEY or legacy E2E_EMAIL/E2E_PASSWORD to run authenticated E2E.')

  test('API-key login and all customer surfaces render', async ({ page }) => {
    await login(page)
    for (const path of ['/dashboard', '/dashboard/billing', '/dashboard/playground', '/dashboard/models', '/dashboard/api-keys', '/dashboard/usage']) {
      await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
      await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/')))
      await expect(page.locator('body')).not.toContainText('Application error')
      await expect(page.locator('body')).not.toContainText('🥕')
    }
  })

  test('billing exposes the 1k entry package', async ({ page }) => {
    await login(page)
    await page.goto(`${baseURL}/dashboard/billing`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /nạp số dư bằng vietqr/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /1\.000/ }).first()).toBeVisible()
    await expect(page.locator('body')).toContainText('Nạp từ 1.000đ')
  })

  test('optional key rotation exposes one new secret and revokes the prior key', async ({ page }) => {
    test.skip(!allowMutations || !e2eEmail || !e2ePassword, 'Use a dedicated legacy test account with E2E_MUTATING=true for rotation tests.')
    await legacyLogin(page)
    await page.goto(`${baseURL}/dashboard/api-keys`, { waitUntil: 'networkidle' })
    await page.getByLabel('Tên key').fill(`E2E rotate ${Date.now()}`)
    await page.getByRole('button', { name: /Rotate API key|Tạo API key/ }).click()
    await expect(page.getByText('Lưu secret trước khi đóng')).toBeVisible({ timeout: 15000 })
    const secret = (await page.locator('.secret-box code').textContent())?.trim() || ''
    expect(secret.startsWith('sk-')).toBeTruthy()
    await expect(page.getByText('1 active')).toBeVisible()
  })

  test('optional topup mutation creates a 1k payment request', async ({ page }) => {
    test.skip(!allowMutations, 'Set E2E_MUTATING=true only for a dedicated test account.')
    await login(page)
    await page.goto(`${baseURL}/dashboard/billing`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /1\.000/ }).first().click()
    await page.getByRole('button', { name: /Thanh toán.*1\.000/i }).click()

    await page.waitForLoadState('domcontentloaded')
    const currentUrl = new URL(page.url())
    const appHost = new URL(baseURL).host

    if (currentUrl.host === appHost) {
      await expect(page).toHaveURL(/\/dashboard\/billing\?topup=/)
      await expect(page.getByAltText('Mã VietQR nạp tiền')).toBeVisible()
      await expect(page.locator('body')).toContainText('Nội dung bắt buộc')
    } else {
      expect(currentUrl.protocol).toBe('https:')
      expect(currentUrl.host).not.toBe(appHost)
    }
  })

  test('optional funded flow returns real Playground and gateway responses', async ({ page, request }) => {
    test.skip(!funded || !e2eApiKey, 'Set E2E_FUNDED=true and E2E_API_KEY for the dedicated funded account.')
    await login(page)

    await page.goto(`${baseURL}/dashboard/playground?model=kimi-k2.6`, { waitUntil: 'networkidle' })
    await page.getByLabel('Prompt').fill('Trả lời đúng một từ: OK')
    await page.getByRole('button', { name: 'Gửi' }).click()
    await expect(page.locator('.message.assistant').last()).toBeVisible({ timeout: 45000 })
    await expect(page.locator('.receipt')).toBeVisible({ timeout: 45000 })
    await expect(page.locator('.notice.danger')).toHaveCount(0)

    const apiRes = await request.post(`${gatewayURL}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${e2eApiKey}`, 'content-type': 'application/json' },
      data: { model: 'kimi-k2.6', messages: [{ role: 'user', content: 'Reply with OK only' }] },
      timeout: 60000,
    })
    expect(apiRes.ok()).toBeTruthy()
    const body = await apiRes.json()
    expect(body?.choices?.[0]?.message?.content).toBeTruthy()
  })
})
