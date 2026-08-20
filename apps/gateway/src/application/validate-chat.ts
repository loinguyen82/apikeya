import type { ChatCompletionRequest } from '@aiapi/contracts'

export interface ValidationResult {
  ok: boolean
  code?: string
  message?: string
}

const MAX_MESSAGES = 256
const MAX_BODY_CHARS = 1_000_000

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
    if (!msg || !['system', 'user', 'assistant', 'tool'].includes(msg.role) || typeof msg.content !== 'string') {
      return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}] không hợp lệ` }
    }
    if (msg.name != null && (typeof msg.name !== 'string' || msg.name.length > 128)) {
      return { ok: false, code: 'INVALID_REQUEST', message: `messages[${index}].name không hợp lệ` }
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
  const maxTokens = body.max_completion_tokens ?? body.max_tokens
  if (maxTokens != null && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 100_000)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'max tokens không hợp lệ' }
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
