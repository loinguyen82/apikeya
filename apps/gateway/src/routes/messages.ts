import { Hono } from 'hono'
import type { ChatCompletionRequest, ChatMessage } from '@aiapi/contracts'
import type { Env } from '../env.js'
import { executeChat } from '../application/execute-chat.js'
import { validateChatRequest } from '../application/validate-chat.js'

type Variables = { userId: string; apiKeyId: string }
type AnthropicContent = string | Array<{ type?: string; text?: string }>
type MessagesRequest = {
  model?: string
  max_tokens?: number
  messages?: Array<{ role?: string; content?: AnthropicContent }>
  system?: string | Array<{ type?: string; text?: string }>
  temperature?: number
  stream?: boolean
}

export const messagesRoute = new Hono<{ Bindings: Env; Variables: Variables }>()

export function contentText(content: AnthropicContent | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (part?.type && part.type !== 'text') throw new Error(`UNSUPPORTED_CONTENT_BLOCK_${part.type.toUpperCase()}`)
      return part?.text ?? ''
    })
    .join('')
}

export function toChatRequest(body: MessagesRequest): ChatCompletionRequest {
  if (!body.model) throw new Error('MODEL_REQUIRED')
  if (!Number.isSafeInteger(body.max_tokens) || (body.max_tokens ?? 0) <= 0) throw new Error('MAX_TOKENS_REQUIRED')
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Error('MESSAGES_REQUIRED')

  const messages: ChatMessage[] = []
  if (body.system) messages.push({ role: 'system', content: contentText(body.system) })
  for (const message of body.messages) {
    if (!['user', 'assistant'].includes(message.role ?? '')) throw new Error('UNSUPPORTED_MESSAGE_ROLE')
    messages.push({ role: message.role as 'user' | 'assistant', content: contentText(message.content) })
  }
  return {
    model: body.model,
    messages,
    stream: body.stream === true,
    temperature: body.temperature,
    max_completion_tokens: body.max_tokens,
  }
}

function getExecutionCtx(c: { executionCtx: { waitUntil(promise: Promise<any>): void } }) {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}

function errorResponse(message: string, status = 400): Response {
  return Response.json(
    { type: 'error', error: { type: 'invalid_request_error', message } },
    { status },
  )
}

export function anthropicPayload(payload: any, model: string): Record<string, unknown> {
  const usage = payload?.usage ?? {}
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0
  const finishReason = payload?.choices?.[0]?.finish_reason
  return {
    id: `msg_${payload?.gateway_request_id ?? crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: payload?.choices?.[0]?.message?.content ?? '' }],
    stop_reason: finishReason === 'length' ? 'max_tokens' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function transformStream(stream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let text = ''
  let usage: any = {}
  let started = false
  const messageId = `msg_${crypto.randomUUID()}`

  return new ReadableStream({
    async pull(controller) {
      try {
        if (!started) {
          started = true
          controller.enqueue(encoder.encode(sseEvent('message_start', { type: 'message_start', message: { id: messageId, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })))
          controller.enqueue(encoder.encode(sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })))
        }
        const result = await reader.read()
        if (!result.done) {
          buffer += decoder.decode(result.value, { stream: true })
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
                  controller.enqueue(encoder.encode(sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } })))
                }
                if (payload?.usage) usage = payload.usage
              } catch {
                // Ignore incomplete provider events.
              }
            }
          }
          return
        }
        controller.enqueue(encoder.encode(sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 })))
        controller.enqueue(encoder.encode(sseEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0 } })))
        controller.enqueue(encoder.encode(sseEvent('message_stop', { type: 'message_stop' })))
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

messagesRoute.post('/', async (c) => {
  let body: MessagesRequest
  try {
    body = await c.req.json<MessagesRequest>()
  } catch {
    return errorResponse('JSON không hợp lệ')
  }

  let chatBody: ChatCompletionRequest
  try {
    chatBody = toChatRequest(body)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Request không hợp lệ')
  }
  const validation = validateChatRequest(chatBody)
  if (!validation.ok) return errorResponse(validation.message ?? 'Request không hợp lệ', validation.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400)

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
  if (body.stream) {
    if (!upstream.body) return errorResponse('Upstream không trả stream', 502)
    return new Response(transformStream(upstream.body, body.model ?? ''), { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-request-id': upstream.headers.get('x-request-id') ?? '' } })
  }
  const payload = await upstream.json()
  return Response.json(anthropicPayload(payload, body.model ?? ''), { status: upstream.status, headers: { 'x-request-id': upstream.headers.get('x-request-id') ?? '' } })
})
