import type { Env } from '../env.js'

const TELEGRAM_WEBHOOK_URL = 'https://api.apivn.tech/internal/telegram/model-health'
const WEBHOOK_CHECK_TTL_MS = 5 * 60 * 1000

let lastWebhookCheckAt = 0

export async function ensureTelegramWebhook(env: Env): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return

  const now = Date.now()
  if (now - lastWebhookCheckAt < WEBHOOK_CHECK_TTL_MS) return
  lastWebhookCheckAt = now

  try {
    const infoResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`)
    const info = infoResponse.ok
      ? await infoResponse.json() as { result?: { url?: string } }
      : null

    if (info?.result?.url === TELEGRAM_WEBHOOK_URL) return

    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: TELEGRAM_WEBHOOK_URL,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message'],
        drop_pending_updates: false,
      }),
    })

    if (!response.ok) {
      lastWebhookCheckAt = 0
      console.error('telegram setWebhook failed', response.status, (await response.text()).slice(0, 300))
    }
  } catch (error) {
    lastWebhookCheckAt = 0
    console.error('telegram webhook setup failed', error)
  }
}
