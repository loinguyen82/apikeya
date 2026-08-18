import { Hono } from 'hono'
import type { ChatCompletionRequest } from '@aiapi/contracts'
import type { Env } from '../env'
import { executeChat } from '../application/execute-chat'
import { validateChatRequest } from '../application/validate-chat'

type Variables = { userId: string; apiKeyId: string }

export const chatRoute = new Hono<{ Bindings: Env; Variables: Variables }>()

chatRoute.post('/', async (c) => {
  let body: ChatCompletionRequest
  try {
    body = await c.req.json<ChatCompletionRequest>()
  } catch {
    return c.json({ error: { message: 'JSON không hợp lệ', type: 'invalid_request_error' } }, 400)
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
    userId: c.get('userId'),
    apiKeyId: c.get('apiKeyId'),
    channel: 'api',
    idempotencyKey: c.req.header('idempotency-key') ?? undefined,
    executionCtx: c.executionCtx,
  })
})
