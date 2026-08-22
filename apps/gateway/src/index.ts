import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env.js'
import { requireApiKey } from './middleware/api-key.js'
import { chatRoute } from './routes/chat.js'
import { modelsRoute } from './routes/models.js'
import { internalPlaygroundRoute } from './routes/internal-playground.js'
import { responsesRoute } from './routes/responses.js'
import { messagesRoute } from './routes/messages.js'
import { handleTelegramUpdate, sendTelegramMessage } from './monitor/model-health.js'
import { ensureTelegramWebhook } from './monitor/telegram-webhook.js'
import { handlePrivateTelegramUpdate, sendPrivateTopupLink } from './monitor/telegram-commerce.js'

const app = new Hono<{ Bindings: Env }>()

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['authorization', 'x-api-key', 'anthropic-version', 'content-type', 'idempotency-key'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })
)

app.get('/healthz', (c) => {
  c.executionCtx.waitUntil(ensureTelegramWebhook(c.env))
  return c.json({ ok: true, service: 'gateway', version: '0.4.5' })
})

app.post('/internal/telegram/model-health', async (c) => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET
  if (!c.env.TELEGRAM_BOT_TOKEN || !secret) {
    return c.json({ ok: false, error: 'telegram_not_configured' }, 503)
  }
  if (c.req.header('x-telegram-bot-api-secret-token') !== secret) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }

  const update = await c.req.json().catch(() => null) as any
  if (!update) return c.json({ ok: false, error: 'invalid_update' }, 400)

  const incomingChatId = update?.message?.chat?.id == null ? '' : String(update.message.chat.id)
  const chatType = typeof update?.message?.chat?.type === 'string' ? update.message.chat.type : ''
  const text = typeof update?.message?.text === 'string' ? update.message.text.trim() : ''

  if (chatType === 'private') {
    await handlePrivateTelegramUpdate(c.env, update)
    return c.json({ ok: true, mode: 'private' })
  }

  const command = text.split(/\s+/)[0]?.split('@')[0]?.toLowerCase() ?? ''
  if (command === '/nap' || command === '/topup' || text === '💰 Nạp tiền') {
    if (incomingChatId) c.executionCtx.waitUntil(sendPrivateTopupLink(c.env, incomingChatId))
    return c.json({ ok: true, mode: 'private_topup_link' })
  }

  const isHealthCommand = command === '/status' || command === '/dead' || command === '/test'
  if (
    incomingChatId &&
    isHealthCommand &&
    c.env.TELEGRAM_CHAT_ID &&
    incomingChatId !== c.env.TELEGRAM_CHAT_ID
  ) {
    c.executionCtx.waitUntil(sendTelegramMessage(
      c.env,
      incomingChatId,
      `🔐 Bot chưa được cấp health-check cho chat này.\nChat ID hiện tại: ${incomingChatId}\nHãy cập nhật TELEGRAM_CHAT_ID nếu đây là group health chính.`
    ))
    return c.json({ ok: true, chat_mismatch: true })
  }

  await handleTelegramUpdate(c.env, update, (promise) => c.executionCtx.waitUntil(promise))
  return c.json({ ok: true, mode: 'group_health' })
})

app.route('/v1/models', modelsRoute)

app.use('/v1/chat/completions/*', requireApiKey)
app.use('/v1/chat/completions', requireApiKey)
app.route('/v1/chat/completions', chatRoute)

app.use('/v1/responses/*', requireApiKey)
app.use('/v1/responses', requireApiKey)
app.route('/v1/responses', responsesRoute)

app.use('/v1/messages/*', requireApiKey)
app.use('/v1/messages', requireApiKey)
app.route('/v1/messages', messagesRoute)

app.route('/internal/playground/chat', internalPlaygroundRoute)

app.notFound((c) => c.json({ error: { message: 'Not found', type: 'invalid_request_error', code: 'not_found' } }, 404))

app.onError((err, c) => {
  console.error(err)
  if (err.message.includes('INSUFFICIENT_BALANCE')) {
    return c.json(
      {
        error: {
          code: 'insufficient_balance',
          message: 'Số dư dùng được chưa đủ cho lượt này.',
          type: 'billing_error',
        },
      },
      402
    )
  }
  if (err.message.includes('IDEMPOTENCY_KEY_TOO_LONG')) {
    return c.json(
      { error: { code: 'idempotency_key_too_long', message: 'Idempotency-Key quá dài.', type: 'invalid_request_error' } },
      400
    )
  }
  if (err.message === 'MODEL_NOT_AVAILABLE') {
    return c.json(
      {
        error: {
          code: 'model_unavailable',
          message: 'Mô hình này hiện không khả dụng.',
          type: 'invalid_request_error',
        },
      },
      404
    )
  }
  return c.json(
    {
      error: {
        code: 'internal_error',
        message: 'Lỗi hệ thống',
        type: 'server_error',
      },
    },
    500
  )
})

export default app
