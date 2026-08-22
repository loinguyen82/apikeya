import { Hono } from 'hono'
import type { ChatCompletionRequest, ChatFunctionTool, ChatMessage, ChatToolChoice } from '@aiapi/contracts'
import type { Env } from '../env.js'
import { executeChat } from '../application/execute-chat.js'
import { validateChatRequest } from '../application/validate-chat.js'
import { normalizeToolCalls } from '../utils/tool-calls.js'

type Variables = { userId: string; apiKeyId: string }
type ResponsesInputItem = {
  type?: string
  role?: string
  content?: unknown
  call_id?: string
  tool_call_id?: string
  id?: string
  name?: string
  arguments?: unknown
  output?: unknown
}
type ResponsesRequest = {
  model?: string
  input?: string | ResponsesInputItem[]
  instructions?: string
  stream?: boolean
  temperature?: number
  max_output_tokens?: number
  tools?: unknown[]
  tool_choice?: unknown
  parallel_tool_calls?: boolean
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function argumentString(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

function outputText(output: unknown): string {
  if (typeof output === 'string' || Array.isArray(output)) return contentText(output)
  try {
    return JSON.stringify(output ?? '')
  } catch {
    return ''
  }
}

function responseTools(tools: unknown[] | undefined): ChatFunctionTool[] | undefined {
  if (!Array.isArray(tools)) return undefined
  const mapped: ChatFunctionTool[] = []
  for (const tool of tools) {
    if (!isRecord(tool) || tool.type !== 'function') continue
    const nested = isRecord(tool.function) ? tool.function : tool
    if (typeof nested.name !== 'string' || !nested.name) continue
    const definition: ChatFunctionTool = {
      type: 'function',
      function: {
        name: nested.name,
        parameters: isRecord(nested.parameters) ? nested.parameters : {},
      },
    }
    if (typeof nested.description === 'string') definition.function.description = nested.description
    if (typeof nested.strict === 'boolean') definition.function.strict = nested.strict
    mapped.push(definition)
  }
  return mapped.length > 0 ? mapped : undefined
}

function responseToolChoice(choice: unknown): ChatToolChoice | undefined {
  if (choice === 'none' || choice === 'auto' || choice === 'required') return choice
  if (!isRecord(choice) || choice.type !== 'function') return undefined
  const nested = isRecord(choice.function) ? choice.function : choice
  if (typeof nested.name !== 'string' || !nested.name) return undefined
  return { type: 'function', function: { name: nested.name } }
}

function appendFunctionCall(messages: ChatMessage[], item: ResponsesInputItem, index: number): void {
  const name = typeof item.name === 'string' && item.name ? item.name : 'unknown_tool'
  const call = {
    id: item.call_id || item.id || `call_response_${index}`,
    type: 'function' as const,
    function: { name, arguments: argumentString(item.arguments) },
  }
  const previous = messages.at(-1)
  if (previous?.role === 'assistant') {
    previous.tool_calls = [...(previous.tool_calls ?? []), call]
    return
  }
  messages.push({ role: 'assistant', content: null, tool_calls: [call] })
}

export function toChatRequest(body: ResponsesRequest): ChatCompletionRequest {
  const messages: ChatMessage[] = []
  if (body.instructions) messages.push({ role: 'system', content: body.instructions })
  if (typeof body.input === 'string') {
    messages.push({ role: 'user', content: body.input })
  } else if (Array.isArray(body.input)) {
    for (const [index, item] of body.input.entries()) {
      if (item.type === 'function_call') {
        appendFunctionCall(messages, item, index)
        continue
      }
      if (item.type === 'function_call_output') {
        const toolCallId = item.call_id || item.tool_call_id
        if (toolCallId) messages.push({ role: 'tool', content: outputText(item.output), tool_call_id: toolCallId })
        continue
      }
      const role = item.role === 'developer' ? 'system' : item.role
      if (!['system', 'user', 'assistant', 'tool'].includes(role ?? '')) continue
      if (role === 'tool') {
        const toolCallId = item.call_id || item.tool_call_id
        if (toolCallId) messages.push({ role: 'tool', content: contentText(item.content), tool_call_id: toolCallId })
        continue
      }
      messages.push({ role: role as 'system' | 'user' | 'assistant', content: contentText(item.content) })
    }
  }
  const tools = responseTools(body.tools)
  const toolChoice = responseToolChoice(body.tool_choice)
  return {
    model: body.model ?? '',
    messages,
    stream: body.stream === true,
    temperature: body.temperature,
    max_completion_tokens: body.max_output_tokens,
    ...(tools ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(typeof body.parallel_tool_calls === 'boolean' ? { parallel_tool_calls: body.parallel_tool_calls } : {}),
  }
}

function responsePayload(payload: any, model: string): Record<string, unknown> {
  const message = payload?.choices?.[0]?.message ?? {}
  const text = typeof message.content === 'string' ? message.content : ''
  const usage = payload?.usage ?? {}
  const idSeed = String(payload?.gateway_request_id ?? payload?.id ?? crypto.randomUUID())
  const id = `resp_${idSeed}`
  const toolCalls = normalizeToolCalls(message, idSeed)
  const output: Array<Record<string, unknown>> = []
  if (text || toolCalls.length === 0) {
    output.push({
      id: `${id}_msg`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text, annotations: [] }],
    })
  }
  toolCalls.forEach((call, index) => {
    output.push({
      id: `fc_${idSeed}_${index}`,
      type: 'function_call',
      status: 'completed',
      call_id: call.id,
      name: call.name,
      arguments: call.arguments,
    })
  })
  return {
    id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output,
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

export function transformResponseStream(stream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  const responseId = `resp_${crypto.randomUUID()}`
  let usage: any = {}
  let started = false
  let nextOutputIndex = 0
  let textState: { outputIndex: number; itemId: string; text: string } | undefined
  const toolStates = new Map<number, {
    outputIndex: number
    itemId: string
    callId: string
    name: string
    arguments: string
  }>()

  const emit = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: string,
    data: unknown,
  ) => controller.enqueue(encoder.encode(sseEvent(event, data)))

  const ensureTextState = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (textState) return textState
    textState = { outputIndex: nextOutputIndex++, itemId: `${responseId}_msg`, text: '' }
    emit(controller, 'response.output_item.added', {
      type: 'response.output_item.added',
      output_index: textState.outputIndex,
      item: { id: textState.itemId, type: 'message', status: 'in_progress', role: 'assistant', content: [] },
    })
    emit(controller, 'response.content_part.added', {
      type: 'response.content_part.added',
      item_id: textState.itemId,
      output_index: textState.outputIndex,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    })
    return textState
  }

  const consumeToolDelta = (
    rawCall: any,
    fallbackIndex: number,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    const toolIndex = Number.isSafeInteger(rawCall?.index) && rawCall.index >= 0 ? rawCall.index : fallbackIndex
    const fn = isRecord(rawCall?.function) ? rawCall.function : {}
    let state = toolStates.get(toolIndex)
    const incomingId = typeof rawCall?.id === 'string' && rawCall.id ? rawCall.id : undefined
    const incomingName = typeof fn.name === 'string' && fn.name ? fn.name : undefined
    if (!state) {
      state = {
        outputIndex: nextOutputIndex++,
        itemId: `fc_${responseId.replace(/^resp_/, '')}_${toolIndex}`,
        callId: incomingId ?? `call_${responseId.replace(/^resp_/, '')}_${toolIndex}`,
        name: incomingName ?? 'unknown_tool',
        arguments: '',
      }
      toolStates.set(toolIndex, state)
      emit(controller, 'response.output_item.added', {
        type: 'response.output_item.added',
        output_index: state.outputIndex,
        item: {
          id: state.itemId,
          type: 'function_call',
          status: 'in_progress',
          call_id: state.callId,
          name: state.name,
          arguments: '',
        },
      })
    } else {
      if (incomingId) state.callId = incomingId
      if (incomingName) {
        state.name = state.name === 'unknown_tool'
          ? incomingName
          : incomingName === state.name ? state.name : `${state.name}${incomingName}`
      }
    }
    const argumentDelta = typeof fn.arguments === 'string' ? fn.arguments : ''
    if (argumentDelta) {
      state.arguments += argumentDelta
      emit(controller, 'response.function_call_arguments.delta', {
        type: 'response.function_call_arguments.delta',
        item_id: state.itemId,
        output_index: state.outputIndex,
        delta: argumentDelta,
      })
    }
  }

  const consumeEvent = (
    event: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      try {
        const payload = JSON.parse(raw)
        const delta = payload?.choices?.[0]?.delta ?? {}
        if (typeof delta.content === 'string' && delta.content) {
          const text = ensureTextState(controller)
          text.text += delta.content
          emit(controller, 'response.output_text.delta', {
            type: 'response.output_text.delta',
            item_id: text.itemId,
            output_index: text.outputIndex,
            content_index: 0,
            delta: delta.content,
          })
        }
        if (Array.isArray(delta.tool_calls)) {
          delta.tool_calls.forEach((call: any, index: number) => consumeToolDelta(call, index, controller))
        } else if (isRecord(delta.function_call)) {
          consumeToolDelta({ index: 0, function: delta.function_call }, 0, controller)
        }
        if (payload?.usage) usage = payload.usage
      } catch {
        // Ignore provider-specific SSE frames that do not contain JSON chat deltas.
      }
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true
          emit(controller, 'response.created', responseCreatedPayload(responseId, model))
        }
        const { done, value } = await reader.read()
        if (!done) {
          buffer += decoder.decode(value, { stream: true })
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
        if (!textState && toolStates.size === 0) ensureTextState(controller)

        const states = [
          ...(textState ? [{ kind: 'text' as const, ...textState }] : []),
          ...Array.from(toolStates.values()).map((state) => ({ kind: 'tool' as const, ...state })),
        ].sort((a, b) => a.outputIndex - b.outputIndex)
        const output: Array<Record<string, unknown>> = []

        for (const state of states) {
          if (state.kind === 'text') {
            const item = {
              id: state.itemId,
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: state.text, annotations: [] }],
            }
            output.push(item)
            emit(controller, 'response.output_text.done', {
              type: 'response.output_text.done', item_id: state.itemId, output_index: state.outputIndex, content_index: 0, text: state.text,
            })
            emit(controller, 'response.content_part.done', {
              type: 'response.content_part.done', item_id: state.itemId, output_index: state.outputIndex, content_index: 0,
              part: { type: 'output_text', text: state.text, annotations: [] },
            })
            emit(controller, 'response.output_item.done', {
              type: 'response.output_item.done', output_index: state.outputIndex, item,
            })
          } else {
            const item = {
              id: state.itemId,
              type: 'function_call',
              status: 'completed',
              call_id: state.callId,
              name: state.name,
              arguments: state.arguments,
            }
            output.push(item)
            emit(controller, 'response.function_call_arguments.done', {
              type: 'response.function_call_arguments.done',
              item_id: state.itemId,
              output_index: state.outputIndex,
              arguments: state.arguments,
            })
            emit(controller, 'response.output_item.done', {
              type: 'response.output_item.done', output_index: state.outputIndex, item,
            })
          }
        }

        const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0
        const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0
        const completed = {
          id: responseId,
          object: 'response',
          created_at: Math.floor(Date.now() / 1000),
          status: 'completed',
          model,
          output,
          output_text: textState?.text ?? '',
          usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
        }
        emit(controller, 'response.completed', { type: 'response.completed', response: completed })
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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

export function transformResponsePayloadStream(
  payload: Record<string, unknown>,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const response = responsePayload(payload, model)
  const output = response.output as any[]
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseEvent('response.created', responseCreatedPayload(response.id as string, model))))
      output.forEach((item, outputIndex) => {
        if (item.type === 'function_call') {
          const pendingItem = { ...item, status: 'in_progress', arguments: '' }
          controller.enqueue(encoder.encode(sseEvent('response.output_item.added', {
            type: 'response.output_item.added', output_index: outputIndex, item: pendingItem,
          })))
          if (item.arguments) {
            controller.enqueue(encoder.encode(sseEvent('response.function_call_arguments.delta', {
              type: 'response.function_call_arguments.delta',
              item_id: item.id,
              output_index: outputIndex,
              delta: item.arguments,
            })))
          }
          controller.enqueue(encoder.encode(sseEvent('response.function_call_arguments.done', {
            type: 'response.function_call_arguments.done',
            item_id: item.id,
            output_index: outputIndex,
            arguments: item.arguments,
          })))
        } else {
          const text = item?.content?.[0]?.text ?? ''
          controller.enqueue(encoder.encode(sseEvent('response.output_item.added', {
            type: 'response.output_item.added', output_index: outputIndex, item: { ...item, status: 'in_progress', content: [] },
          })))
          controller.enqueue(encoder.encode(sseEvent('response.content_part.added', {
            type: 'response.content_part.added', item_id: item.id, output_index: outputIndex, content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] },
          })))
          if (text) controller.enqueue(encoder.encode(sseEvent('response.output_text.delta', {
            type: 'response.output_text.delta', item_id: item.id, output_index: outputIndex, content_index: 0, delta: text,
          })))
          controller.enqueue(encoder.encode(sseEvent('response.output_text.done', {
            type: 'response.output_text.done', item_id: item.id, output_index: outputIndex, content_index: 0, text,
          })))
          controller.enqueue(encoder.encode(sseEvent('response.content_part.done', {
            type: 'response.content_part.done', item_id: item.id, output_index: outputIndex, content_index: 0,
            part: { type: 'output_text', text, annotations: [] },
          })))
        }
        controller.enqueue(encoder.encode(sseEvent('response.output_item.done', {
          type: 'response.output_item.done', output_index: outputIndex, item,
        })))
      })
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
      return new Response(transformResponsePayloadStream(payload, body.model ?? ''), {
        status: upstream.status,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-request-id': upstream.headers.get('x-request-id') ?? '' },
      })
    }
    return Response.json(responsePayload(payload, body.model ?? ''), { status: upstream.status, headers: { 'x-request-id': upstream.headers.get('x-request-id') ?? '' } })
  }
  return new Response(transformResponseStream(upstream.body, body.model ?? ''), {
    status: upstream.status,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-request-id': upstream.headers.get('x-request-id') ?? '' },
  })
})
