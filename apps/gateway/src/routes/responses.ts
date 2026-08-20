import { Hono } from 'hono'
import type { ChatCompletionRequest, ChatMessage } from '@aiapi/contracts'
import type { Env } from '../env.js'
import { executeChat } from '../application/execute-chat.js'
import { validateChatRequest } from '../application/validate-chat.js'

type Variables = { userId: string; apiKeyId: string }
type ResponsesRequest = {
  model?: string
  input?: string | Array<{ role?: string; content?: unknown }>
  instructions?: string
  stream?: boolean
  temperature?: number
  max_output_tokens?: number
}

export const responsesRoute = new Hono<{ Bindings: Env; Variables: Variables }>()

function getExecutionCtx(c: { executionCtx: { waitUntil(promise: Promise<any>): void } }) {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: any) => (typeof part === 'string' ? part : part?.text ?? ''))
    .join('')
}

function toChatRequest(body: ResponsesRequest): ChatCompletionRequest {
  const messages: ChatMessage[] = []
  if (body.instructions) messages.push({ role: 'system', content: body.instructions })
  if (typeof body.input === 'string') {
    messages.push({ role: 'user', content: body.input })
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      const role = item.role === 'developer' ? 'system' : item.role
      if (!['system', 'user', 'assistant', 'tool'].includes(role ?? '')) continue
      messages.push({ role: role as ChatMessage['role'], content: contentText(item.content) })
    }
  }
  return {
    model: body.model ?? '',
    messages,
    stream: false,
    temperature: body.temperature,
    max_completion_tokens: body.max_output_tokens,
  }
}

function responsePayload(payload: any, model: string): Record<string, unknown> {
  const text = payload?.choices?.[0]?.message?.content ?? ''
  const usage = payload?.usage ?? {}
  const id = `resp_${payload?.gateway_request_id ?? crypto.randomUUID()}`
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output: [{
      id: `${id}_msg`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text, annotations: [] }],
    }],
    output_text: text,
    usage: {
      input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      total_tokens: (usage.prompt_tokens ?? usage.input_tokens ?? 0) + (usage.completion_tokens ?? usage.output_tokens ?? 0),
    },
  }
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function responseCreatedPayload(id: string, model: string): Record<string, unknown> {
  return {
    type: 'response.created',
    response: {
      id,
      object: 'response',
      status: 'in_progress',
      model,
    },
  }
}

function transformStream(stream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let responseId = `resp_${crypto.randomUUID()}`
  let text = ''
  let usage: any = {}
  let started = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true
          controller.enqueue(encoder.encode(sseEvent('response.created', responseCreatedPayload(responseId, model))))
        }
        const { done, value } = await reader.read()
        if (!done) {
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split(/\r?\n\r?\n/)
          buffer = events.pop() ?? ''
          for (const event of events) {
            for (const line of event.split(/\r?\n/)) {
              if (!line.startsWith('data:')) continue
              const raw = line.slice(5).trim()
              if (!raw || raw === '[DONE]') continue
              try {
                const payload = JSON.parse(raw)
                const delta = payload?.choices?.[0]?.delta?.content
                if (typeof delta === 'string' && delta) {
                  text += delta
                  controller.enqueue(encoder.encode(sseEvent('response.output_text.delta', { type: 'response.output_text.delta', delta })))
                }
                if (payload?.usage) usage = payload.usage
              } catch {
                // Ignore incomplete or provider-specific SSE payloads.
              }
            }
          }
          return
        }
        buffer += decoder.decode()
        const completed = responsePayload({ gateway_request_id: responseId, choices: [{ message: { content: text } }], usage }, model)
        completed.id = responseId
        controller.enqueue(encoder.encode(sseEvent('response.completed', completed)))
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}

function transformPayload(payload: Record<string, unknown>, model: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const response = responsePayload(payload, model)
  const text = (response.output_text as string) ?? ''
  const item = (response.output as any[])[0]
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseEvent('response.created', responseCreatedPayload(response.id as string, model))))
      controller.enqueue(encoder.encode(sseEvent('response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } })))
      controller.enqueue(encoder.encode(sseEvent('response.content_part.added', { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })))
      if (text) controller.enqueue(encoder.encode(sseEvent('response.output_text.delta', { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text })))
      controller.enqueue(encoder.encode(sseEvent('response.output_text.done', { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text })))
      controller.enqueue(encoder.encode(sseEvent('response.content_part.done', { type: 'response.content_part.done', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text, annotations: [] } })))
      controller.enqueue(encoder.encode(sseEvent('response.output_item.done', { type: 'response.output_item.done', output_index: 0, item })))
      controller.enqueue(encoder.encode(sseEvent('response.completed', { type: 'response.completed', response })))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

responsesRoute.post('/', async (c) => {
  let body: ResponsesRequest
  try {
    body = await c.req.json<ResponsesRequest>()
  } catch {
    return c.json({ error: { message: 'JSON không hợp lệ', type: 'invalid_request_error' } }, 400)
  }
  const chatBody = toChatRequest(body)
  const validation = validateChatRequest(chatBody)
  if (!validation.ok) {
    const status = validation.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400
    return c.json({ error: { code: validation.code, message: validation.message, type: 'invalid_request_error' } }, status)
  }
  const upstream = await executeChat({
    env: c.env,
    body: chatBody,
    userId: c.get('userId'),
    apiKeyId: c.get('apiKeyId'),
    channel: 'api',
    idempotencyKey: c.req.header('idempotency-key') ?? undefined,
    executionCtx: getExecutionCtx(c),
  })
  if (!upstream.ok) return upstream
  if (!body.stream || !upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
    const payload = (await upstream.json()) as Record<string, unknown>
    if (body.stream) {
      return new Response(transformPayload(payload, body.model ?? ''), {
        status: upstream.status,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-request-id': upstream.headers.get('x-request-id') ?? '' },
      })
    }
    return Response.json(responsePayload(payload, body.model ?? ''), { status: upstream.status, headers: { 'x-request-id': upstream.headers.get('x-request-id') ?? '' } })
  }
  return new Response(transformStream(upstream.body, body.model ?? ''), {
    status: upstream.status,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-request-id': upstream.headers.get('x-request-id') ?? '' },
  })
})
