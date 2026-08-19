import { Hono } from 'hono'
import type { ChatCompletionRequest } from '@aiapi/contracts'
import type { Env } from '../env.js'
import { executeChat } from '../application/execute-chat.js'
import { validateChatRequest } from '../application/validate-chat.js'

export const internalPlaygroundRoute = new Hono<{ Bindings: Env }>()

function getExecutionCtx(c: { executionCtx: { waitUntil(promise: Promise<any>): void } }) {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}

internalPlaygroundRoute.post('/', async (c) => {
  if (!c.env.INTERNAL_ADMIN_TOKEN || c.req.header('x-internal-token') !== c.env.INTERNAL_ADMIN_TOKEN) {
    return c.json({ error: { message: 'Unauthorized internal call' } }, 401)
  }
  const userId = c.req.header('x-user-id')
  if (!userId) return c.json({ error: { message: 'Missing user context' } }, 400)

  let body: ChatCompletionRequest
  try {
    body = await c.req.json<ChatCompletionRequest>()
  } catch {
    return c.json({ error: { message: 'JSON không hợp lệ' } }, 400)
  }

  const validation = validateChatRequest(body)
  if (!validation.ok) {
    const status = validation.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400
    return c.json(
      { error: { code: validation.code, message: validation.message, type: 'invalid_request_error' } },
      status
    )
  }

  return executeChat({
    env: c.env,
    body,
    userId,
    apiKeyId: null,
    channel: 'playground',
    idempotencyKey: c.req.header('idempotency-key') ?? undefined,
    executionCtx: getExecutionCtx(c),
  })
})
