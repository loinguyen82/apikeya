import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { requireApiKey } from './middleware/api-key'
import { chatRoute } from './routes/chat'
import { modelsRoute } from './routes/models'
import { internalPlaygroundRoute } from './routes/internal-playground'

const app = new Hono<{ Bindings: Env }>()

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-internal-token', 'x-user-id'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })
)

app.get('/healthz', (c) => c.json({ ok: true, service: 'gateway', version: '0.4.0' }))

app.route('/v1/models', modelsRoute)

app.use('/v1/chat/completions/*', requireApiKey)
app.use('/v1/chat/completions', requireApiKey)
app.route('/v1/chat/completions', chatRoute)

app.route('/internal/playground/chat', internalPlaygroundRoute)

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
        message: err.message || 'Lỗi hệ thống',
        type: 'server_error',
      },
    },
    500
  )
})

export default app
