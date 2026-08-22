import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env.js'
import { requireApiKey } from './middleware/api-key.js'
import { chatRoute } from './routes/chat.js'
import { modelsRoute } from './routes/models.js'
import { responsesRoute } from './routes/responses.js'
import { messagesRoute } from './routes/messages.js'

const app = new Hono<{ Bindings: Env }>()

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['authorization', 'x-api-key', 'anthropic-version', 'content-type', 'idempotency-key', 'x-internal-token', 'x-user-id', 'x-user-assertion'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })
)

app.get('/healthz', (c) => c.json({ ok: true, service: 'gateway', version: '0.4.0' }))

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

app.notFound((c) => c.json({ error: { message: 'Not found', type: 'not_found' } }, 404))

app.onError((err, c) => {
  console.error(err)
  if (err.message.includes('INSUFFICIENT_BALANCE')) {
    return c.json(
      {
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'Số dư dùng được chưa đủ cho lượt này.',
          type: 'billing_error',
        },
      },
      402
    )
  }
  if (err.message.includes('IDEMPOTENCY_KEY_TOO_LONG')) {
    return c.json(
      { error: { code: 'IDEMPOTENCY_KEY_TOO_LONG', message: 'Idempotency-Key quá dài.', type: 'invalid_request_error' } },
      400
    )
  }
  if (err.message === 'MODEL_NOT_AVAILABLE') {
    return c.json(
      {
        error: {
          code: 'MODEL_NOT_AVAILABLE',
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
        code: 'INTERNAL_ERROR',
        message: 'Lỗi hệ thống',
        type: 'server_error',
      },
    },
    500
  )
})

export default app
