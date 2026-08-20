import { test, expect } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'https://apikeya.vercel.app'
const stamp = Date.now()
const email = `e2e.apikeya+${stamp}@example.com`
const password = `E2e!${stamp}Aa`

test.describe.serial('Apikeya production journey', () => {
  test('public landing, docs and auth pages render', async ({ page }) => {
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await expect(page.getByText('Apikeya').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /đăng nhập/i }).first()).toBeVisible()

    await page.goto(`${baseURL}/docs`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /tích hợp bằng api chuẩn openai/i })).toBeVisible()

    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /đăng nhập/i })).toBeVisible()

    await page.goto(`${baseURL}/signup`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /tạo tài khoản/i })).toBeVisible()
  })

  test('protected dashboard redirects anonymous users', async ({ page }) => {
    await page.goto(`${baseURL}/dashboard`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/login/)
  })

  test('signup then navigate main authenticated surfaces', async ({ page }) => {
    await page.goto(`${baseURL}/signup`, { waitUntil: 'networkidle' })
    await page.getByLabel('Tên hiển thị').fill('E2E Apikeya')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Mật khẩu').fill(password)
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30000 })
    await expect(page.getByText('Apikeya').first()).toBeVisible()

    for (const path of ['/dashboard/models', '/dashboard/api-keys', '/dashboard/billing', '/dashboard/playground', '/dashboard/usage']) {
      await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
      await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/')))
      await expect(page.locator('body')).not.toContainText('Application error')
    }
  })

  test('API key create and revoke flow works', async ({ page }) => {
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Mật khẩu').fill(password)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForURL(/\/dashboard/)

    await page.goto(`${baseURL}/dashboard/api-keys`, { waitUntil: 'networkidle' })
    await page.getByLabel('Tên key').fill('E2E key')
    await page.getByRole('button', { name: 'Tạo API key' }).click()
    await expect(page.getByText('Lưu secret trước khi đóng')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Đã lưu' }).click()

    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Thu hồi' }).first().click()
    await expect(page.getByText('Revoked').first()).toBeVisible({ timeout: 15000 })
  })

  test('billing and playground interaction do not crash', async ({ page }) => {
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Mật khẩu').fill(password)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForURL(/\/dashboard/)

    await page.goto(`${baseURL}/dashboard/billing`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /nạp số dư bằng vietqr/i })).toBeVisible()
    await page.getByRole('button', { name: /500\.000/ }).click()

    await page.goto(`${baseURL}/dashboard/playground`, { waitUntil: 'networkidle' })
    const prompt = page.getByLabel('Prompt')
    if (await prompt.isEnabled()) {
      await prompt.fill('Trả lời đúng một từ: OK')
      await page.getByRole('button', { name: 'Gửi' }).click()
      await expect(page.locator('.receipt, .notice.danger, .message.assistant')).toBeVisible({ timeout: 45000 })
    }
  })
})
