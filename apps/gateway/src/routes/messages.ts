import { Hono } from 'hono'
import type {
  ChatCompletionRequest,
  ChatFunctionTool,
  ChatMessage,
  ChatToolCall,
  ChatToolChoice,
} from '@aiapi/contracts'
import type { Env } from '../env.js'
import { executeChat } from '../application/execute-chat.js'
import { validateChatRequest } from '../application/validate-chat.js'
import { normalizeToolCalls } from '../utils/tool-calls.js'

type Variables = { userId: string; apiKeyId: string }
type AnthropicNestedTextBlock = { type?: string; text?: string }
type AnthropicContentBlock = {
  type?: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string | AnthropicNestedTextBlock[]
  is_error?: boolean
}
type AnthropicContent = string | AnthropicContentBlock[]
type AnthropicTool = {
  type?: string
  name?: string
  description?: string
  input_schema?: Record<string, unknown>
  strict?: boolean
}
type AnthropicToolChoice = {
  type?: string
  name?: string
  disable_parallel_tool_use?: boolean
}
type MessagesRequest = {
  model?: string
  max_tokens?: number
  messages?: Array<{ role?: string; content?: AnthropicContent }>
  system?: string | Array<{ type?: string; text?: string }>
  temperature?: number
  stream?: boolean
  tools?: AnthropicTool[]
  tool_choice?: AnthropicToolChoice
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

function jsonString(value: unknown, errorCode: string): string {
  try {
    return JSON.stringify(value ?? {}) ?? '{}'
  } catch {
    throw new Error(errorCode)
  }
}

function toolResultText(content: AnthropicContentBlock['content']): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  return contentText(content)
}

function assistantMessage(content: AnthropicContent | undefined): ChatMessage {
  if (typeof content === 'string' || !Array.isArray(content)) {
    return { role: 'assistant', content: typeof content === 'string' ? content : '' }
  }

  const text: string[] = []
  const toolCalls: ChatToolCall[] = []
  let hasTextBlock = false
  for (const block of content) {
    if (!block?.type || block.type === 'text') {
      hasTextBlock = true
      text.push(block?.text ?? '')
      continue
    }
    if (block.type !== 'tool_use') {
      throw new Error(`UNSUPPORTED_ASSISTANT_CONTENT_BLOCK_${block.type.toUpperCase()}`)
    }
    if (typeof block.id !== 'string' || !block.id) throw new Error('TOOL_USE_ID_REQUIRED')
    if (typeof block.name !== 'string' || !block.name) throw new Error('TOOL_USE_NAME_REQUIRED')
    toolCalls.push({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: jsonString(block.input, 'INVALID_TOOL_USE_INPUT'),
      },
    })
  }

  return {
    role: 'assistant',
    content: hasTextBlock ? text.join('') : toolCalls.length > 0 ? null : '',
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
}

function appendUserMessages(messages: ChatMessage[], content: AnthropicContent | undefined): void {
  if (typeof content === 'string' || !Array.isArray(content)) {
    messages.push({ role: 'user', content: typeof content === 'string' ? content : '' })
    return
  }

  let textParts: string[] = []
  let hasTextBlock = false
  let emitted = false
  const flushText = () => {
    if (!hasTextBlock) return
    messages.push({ role: 'user', content: textParts.join('') })
    textParts = []
    hasTextBlock = false
    emitted = true
  }

  for (const block of content) {
    if (!block?.type || block.type === 'text') {
      hasTextBlock = true
      textParts.push(block?.text ?? '')
      continue
    }
    if (block.type !== 'tool_result') {
      throw new Error(`UNSUPPORTED_USER_CONTENT_BLOCK_${block.type.toUpperCase()}`)
    }
    flushText()
    if (typeof block.tool_use_id !== 'string' || !block.tool_use_id) {
      throw new Error('TOOL_RESULT_TOOL_USE_ID_REQUIRED')
    }
    messages.push({
      role: 'tool',
      content: toolResultText(block.content),
      tool_call_id: block.tool_use_id,
    })
    emitted = true
  }
  flushText()
  if (!emitted) messages.push({ role: 'user', content: '' })
}

function openAITools(tools: AnthropicTool[]): ChatFunctionTool[] {
  return tools.map((tool): ChatFunctionTool => {
    if (typeof tool?.name !== 'string' || !tool.name) throw new Error('TOOL_NAME_REQUIRED')
    if (!tool.input_schema || typeof tool.input_schema !== 'object' || Array.isArray(tool.input_schema)) {
      throw new Error('TOOL_INPUT_SCHEMA_REQUIRED')
    }
    return {
      type: 'function',
      function: {
        name: tool.name,
        ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
        parameters: tool.input_schema,
        ...(typeof tool.strict === 'boolean' ? { strict: tool.strict } : {}),
      },
    }
  })
}

function openAIToolChoice(choice: AnthropicToolChoice): ChatToolChoice {
  switch (choice?.type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'none':
      return 'none'
    case 'tool':
      if (typeof choice.name !== 'string' || !choice.name) throw new Error('TOOL_CHOICE_NAME_REQUIRED')
      return { type: 'function', function: { name: choice.name } }
    default:
      throw new Error(`UNSUPPORTED_TOOL_CHOICE_${String(choice?.type ?? 'UNKNOWN').toUpperCase()}`)
  }
}

export function toChatRequest(body: MessagesRequest): ChatCompletionRequest {
  if (!body.model) throw new Error('MODEL_REQUIRED')
  if (!Number.isSafeInteger(body.max_tokens) || (body.max_tokens ?? 0) <= 0) throw new Error('MAX_TOKENS_REQUIRED')
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Error('MESSAGES_REQUIRED')

  const messages: ChatMessage[] = []
  if (body.system) messages.push({ role: 'system', content: contentText(body.system) })
  for (const message of body.messages) {
    if (!['user', 'assistant'].includes(message.role ?? '')) throw new Error('UNSUPPORTED_MESSAGE_ROLE')
    if (message.role === 'assistant') messages.push(assistantMessage(message.content))
    else appendUserMessages(messages, message.content)
  }
  const request: ChatCompletionRequest = {
    model: body.model,
    messages,
    stream: body.stream === true,
    temperature: body.temperature,
    max_completion_tokens: body.max_tokens,
  }
  if (body.tools !== undefined) request.tools = openAITools(body.tools)
  if (body.tool_choice !== undefined) {
    request.tool_choice = openAIToolChoice(body.tool_choice)
    if (typeof body.tool_choice.disable_parallel_tool_use === 'boolean') {
      request.parallel_tool_calls = !body.tool_choice.disable_parallel_tool_use
    }
  }
  return request
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
  const choice = payload?.choices?.[0] ?? {}
  const message = choice?.message ?? {}
  const idSeed = String(payload?.gateway_request_id ?? payload?.id ?? crypto.randomUUID())
  const toolCalls = normalizeToolCalls(message, idSeed)
  const content: Array<Record<string, unknown>> = []
  if (typeof message.content === 'string' && (message.content || toolCalls.length === 0)) {
    content.push({ type: 'text', text: message.content })
  } else if (toolCalls.length === 0) {
    content.push({ type: 'text', text: '' })
  }
  for (const call of toolCalls) {
    content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
  }
  const finishReason = choice?.finish_reason
  return {
    id: `msg_${idSeed}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: finishReason === 'length'
      ? 'max_tokens'
      : toolCalls.length > 0 || finishReason === 'tool_calls' || finishReason === 'function_call'
        ? 'tool_use'
        : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function transformAnthropicPayloadStream(
  payload: any,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const message = anthropicPayload(payload, model) as any
  const content = Array.isArray(message?.content) ? message.content : []

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseEvent('message_start', {
        type: 'message_start',
        message: {
          ...message,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: message.usage.input_tokens, output_tokens: 0 },
        },
      })))
      for (const [index, block] of content.entries()) {
        if (block.type === 'tool_use') {
          controller.enqueue(encoder.encode(sseEvent('content_block_start', {
            type: 'content_block_start',
            index,
            content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
          })))
          controller.enqueue(encoder.encode(sseEvent('content_block_delta', {
            type: 'content_block_delta',
            index,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) },
          })))
        } else {
          controller.enqueue(encoder.encode(sseEvent('content_block_start', {
            type: 'content_block_start',
            index,
            content_block: { type: 'text', text: '' },
          })))
          if (block.text) {
            controller.enqueue(encoder.encode(sseEvent('content_block_delta', {
              type: 'content_block_delta',
              index,
              delta: { type: 'text_delta', text: block.text },
            })))
          }
        }
        controller.enqueue(encoder.encode(sseEvent('content_block_stop', {
          type: 'content_block_stop',
          index,
        })))
      }
      controller.enqueue(encoder.encode(sseEvent('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: message.stop_reason, stop_sequence: null },
        usage: { output_tokens: message.usage.output_tokens },
      })))
      controller.enqueue(encoder.encode(sseEvent('message_stop', { type: 'message_stop' })))
      controller.close()
    },
  })
}

export function transformAnthropicStream(stream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let usage: any = {}
  let started = false
  let textBlockStarted = false
  let finishReason: string | undefined
  const messageId = `msg_${crypto.randomUUID()}`
  const toolCalls = new Map<number, {
    id: string
    name: string
    argumentDeltas: string[]
  }>()

  const enqueue = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: string,
    data: unknown,
  ) => controller.enqueue(encoder.encode(sseEvent(event, data)))

  const startMessage = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (started) return
    started = true
    enqueue(controller, 'message_start', {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    })
  }

  const startTextBlock = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (textBlockStarted) return
    textBlockStarted = true
    enqueue(controller, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })
  }

  const mergeMetadataFragment = (current: string, fragment: unknown): string => {
    if (typeof fragment !== 'string' || !fragment) return current
    if (!current || fragment.startsWith(current)) return fragment
    if (fragment === current || current.endsWith(fragment)) return current
    return current + fragment
  }

  const streamToolCall = (rawCall: any, position: number) => {
    const rawIndex = rawCall?.index
    const index = Number.isSafeInteger(rawIndex) && rawIndex >= 0 ? rawIndex : position
    const call = toolCalls.get(index) ?? { id: '', name: '', argumentDeltas: [] }
    call.id = mergeMetadataFragment(call.id, rawCall?.id)
    call.name = mergeMetadataFragment(call.name, rawCall?.function?.name)
    const args = rawCall?.function?.arguments
    if (typeof args === 'string' && args) call.argumentDeltas.push(args)
    else if (args != null && typeof args !== 'string') {
      call.argumentDeltas.push(jsonString(args, 'INVALID_STREAM_TOOL_ARGUMENTS'))
    }
    toolCalls.set(index, call)
  }

  const consumeEvent = (
    event: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    const raw = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (!raw || raw === '[DONE]') return
    try {
      const payload = JSON.parse(raw)
      const choice = payload?.choices?.[0]
      const delta = choice?.delta ?? {}
      if (typeof delta.content === 'string' && delta.content) {
        startTextBlock(controller)
        enqueue(controller, 'content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: delta.content },
        })
      }
      if (Array.isArray(delta.tool_calls)) {
        delta.tool_calls.forEach((call: any, index: number) => streamToolCall(call, index))
      }
      if (delta.function_call && typeof delta.function_call === 'object') {
        streamToolCall({ index: 0, function: delta.function_call }, 0)
      }
      if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason
      if (payload?.usage) usage = payload.usage
    } catch {
      // Ignore provider-specific SSE frames that do not contain JSON chat deltas.
    }
  }

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (!textBlockStarted && toolCalls.size === 0) startTextBlock(controller)
    if (textBlockStarted) {
      enqueue(controller, 'content_block_stop', { type: 'content_block_stop', index: 0 })
    }

    let blockIndex = textBlockStarted ? 1 : 0
    const idSeed = messageId.slice('msg_'.length)
    for (const [toolIndex, call] of [...toolCalls.entries()].sort(([left], [right]) => left - right)) {
      const index = blockIndex++
      enqueue(controller, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'tool_use',
          id: call.id || `call_${idSeed}_${toolIndex}`,
          name: call.name || 'unknown_tool',
          input: {},
        },
      })
      const deltas = call.argumentDeltas.length > 0 ? call.argumentDeltas : ['{}']
      for (const partialJson of deltas) {
        enqueue(controller, 'content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: partialJson },
        })
      }
      enqueue(controller, 'content_block_stop', { type: 'content_block_stop', index })
    }

    const stopReason = finishReason === 'length'
      ? 'max_tokens'
      : toolCalls.size > 0 || finishReason === 'tool_calls' || finishReason === 'function_call'
        ? 'tool_use'
        : 'end_turn'
    enqueue(controller, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0 },
    })
    enqueue(controller, 'message_stop', { type: 'message_stop' })
    controller.close()
  }

  return new ReadableStream({
    async pull(controller) {
      try {
        startMessage(controller)
        const result = await reader.read()
        if (!result.done) {
          buffer += decoder.decode(result.value, { stream: true })
          const events = buffer.split(/\r?\n\r?\n/)
          buffer = events.pop() ?? ''
          for (const event of events) {
            consumeEvent(event, controller)
          }
          return
        }
        buffer += decoder.decode()
        if (buffer) consumeEvent(buffer, controller)
        buffer = ''
        finish(controller)
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
    const stream = upstream.headers.get('content-type')?.includes('text/event-stream')
      ? transformAnthropicStream(upstream.body, body.model ?? '')
      : transformAnthropicPayloadStream(await upstream.json(), body.model ?? '')
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-request-id': upstream.headers.get('x-request-id') ?? '' } })
  }
  const payload = await upstream.json()
  return Response.json(anthropicPayload(payload, body.model ?? ''), { status: upstream.status, headers: { 'x-request-id': upstream.headers.get('x-request-id') ?? '' } })
})
