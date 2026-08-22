import type { ChatCompletionRequest } from '@aiapi/contracts'

export interface ValidationResult {
  ok: boolean
  code?: string
  message?: string
}

const MAX_MESSAGES = 256
const MAX_BODY_CHARS = 1_000_000
const MAX_TOOL_CALLS_PER_MESSAGE = 128

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validToolCalls(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TOOL_CALLS_PER_MESSAGE) return false
  const ids = new Set<string>()
  for (const call of value) {
    if (!isRecord(call) || call.type !== 'function' || typeof call.id !== 'string' || call.id.length < 1 || call.id.length > 256) {
      return false
    }
    if (ids.has(call.id)) return false
    ids.add(call.id)
    if (!isRecord(call.function)) return false
    if (typeof call.function.name !== 'string' || call.function.name.length < 1 || call.function.name.length > 256) return false
    if (typeof call.function.arguments !== 'string') return false
  }
  return true
}

export function validateChatRequest(body: ChatCompletionRequest): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Body không hợp lệ' }
  }
  if (typeof body.model !== 'string' || body.model.length < 1 || body.model.length > 128) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'model không hợp lệ' }
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
    return { ok: false, code: 'INVALID_REQUEST', message: `messages phải có từ 1 đến ${MAX_MESSAGES} phần tử` }
  }
  for (const [index, msg] of body.messages.entries()) {
    if (!msg || !['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
      return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}] không hợp lệ` }
    }
    if (msg.name != null && (typeof msg.name !== 'string' || msg.name.length > 128)) {
      return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}].name không hợp lệ` }
    }
    const hasToolCalls = msg.tool_calls != null
    if (hasToolCalls && (msg.role !== 'assistant' || !validToolCalls(msg.tool_calls))) {
      return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}].tool_calls không hợp lệ` }
    }
    if (msg.role === 'assistant') {
      if (typeof msg.content !== 'string' && !(msg.content == null && hasToolCalls)) {
        return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}].content không hợp lệ` }
      }
    } else if (typeof msg.content !== 'string') {
      return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}].content không hợp lệ` }
    }
    if (msg.role === 'tool') {
      if (typeof msg.tool_call_id !== 'string' || msg.tool_call_id.length < 1 || msg.tool_call_id.length > 256) {
        return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}].tool_call_id không hợp lệ` }
      }
    } else if (msg.tool_call_id != null) {
      return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}].tool_call_id không hợp lệ` }
    }
  }
  if (body.stream != null && typeof body.stream !== 'boolean') {
    return { ok: false, code: 'INVALID_REQUEST', message: 'stream phải là boolean' }
  }
  if (body.temperature != null && (typeof body.temperature !== 'number' || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'temperature không hợp lệ' }
  }
  if (body.stream_options != null && (
    typeof body.stream_options !== 'object' ||
    Array.isArray(body.stream_options) ||
    (body.stream_options.include_usage != null && typeof body.stream_options.include_usage !== 'boolean')
  )) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'stream_options không hợp lệ' }
  }
  if (body.parallel_tool_calls != null && typeof body.parallel_tool_calls !== 'boolean') {
    return { ok: false, code: 'INVALID_REQUEST', message: 'parallel_tool_calls không hợp lệ' }
  }
  const maxTokens = body.max_completion_tokens ?? body.max_tokens
  if (maxTokens != null && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 100_000)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'max tokens không hợp lệ' }
  }
  if (body.n != null && body.n !== 1) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Only n=1 is supported to keep billing reserves bounded' }
  }
  if (body.best_of != null && body.best_of !== 1) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Only best_of=1 is supported to keep billing reserves bounded' }
  }
  if (body.max_output_tokens != null || body.max_new_tokens != null) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Use max_tokens or max_completion_tokens' }
  }
  let serialized = ''
  try {
    serialized = JSON.stringify(body)
  } catch {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Body không serialize được' }
  }
  if (serialized.length > MAX_BODY_CHARS) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request quá lớn' }
  }
  return { ok: true }
}
