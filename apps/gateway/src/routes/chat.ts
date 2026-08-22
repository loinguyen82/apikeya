import { Hono } from 'hono'
import type { ChatCompletionRequest } from '@aiapi/contracts'
import type { Env } from '../env.js'
import { executeChat } from '../application/execute-chat.js'
import { validateChatRequest } from '../application/validate-chat.js'

type Variables = { userId: string; apiKeyId: string }

export const chatRoute = new Hono<{ Bindings: Env; Variables: Variables }>()

function sseData(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function completionDelta(message: any): Record<string, unknown> {
  const delta: Record<string, unknown> = { role: 'assistant' }
  if (typeof message?.content === 'string') delta.content = message.content
  if (typeof message?.refusal === 'string') delta.refusal = message.refusal
  if (Array.isArray(message?.tool_calls)) {
    delta.tool_calls = message.tool_calls.map((call: any, index: number) => ({
      ...call,
      index: call?.index ?? index,
    }))
  }
  if (message?.function_call && typeof message.function_call === 'object') {
    delta.function_call = message.function_call
  }
  if (message?.audio && typeof message.audio === 'object') delta.audio = message.audio
  return delta
}

export function transformChatPayloadStream(payload: any): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const id = payload?.id ?? `chatcmpl_${payload?.gateway_request_id ?? crypto.randomUUID()}`
  const baseChunk = {
    id,
    object: 'chat.completion.chunk',
    created: payload?.created ?? Math.floor(Date.now() / 1000),
    model: payload?.model,
  }
  const contentChunk = {
    ...baseChunk,
    choices: (payload?.choices ?? []).map((choice: any, index: number) => ({
      index: choice?.index ?? index,
      delta: completionDelta(choice?.message),
      finish_reason: null,
      logprobs: choice?.logprobs ?? null,
    })),
  }
  const completionChunk = {
    ...baseChunk,
    choices: (payload?.choices ?? []).map((choice: any, index: number) => ({
      index: choice?.index ?? index,
      delta: {},
      finish_reason: choice?.finish_reason ?? 'stop',
      logprobs: choice?.logprobs ?? null,
    })),
    usage: payload?.usage,
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseData(contentChunk)))
      controller.enqueue(encoder.encode(sseData(completionChunk)))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

function getExecutionCtx(c: { executionCtx: { waitUntil(promise: Promise<any>): void } }) {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}

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

  const upstream = await executeChat({
    env: c.env,
    body,
    userId: c.get('userId'),
    apiKeyId: c.get('apiKeyId'),
    channel: 'api',
    idempotencyKey: c.req.header('idempotency-key') ?? undefined,
    executionCtx: getExecutionCtx(c),
  })
  if (!body.stream || !upstream.ok || upstream.headers.get('content-type')?.includes('text/event-stream')) {
    return upstream
  }

  const payload = await upstream.json()
  return new Response(transformChatPayloadStream(payload), {
    status: upstream.status,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-request-id': upstream.headers.get('x-request-id') ?? '',
    },
  })
})
