import { describe, expect, it } from 'vitest'
import { validateChatRequest } from '../src/application/validate-chat.js'

const validRequest = {
  model: 'demo-model',
  messages: [{ role: 'user' as const, content: 'hello' }],
}

describe('validateChatRequest', () => {
  it('rejects non-boolean stream values', () => {
    const result = validateChatRequest({ ...validRequest, stream: 'false' as unknown as boolean })
    expect(result.ok).toBe(false)
  })

  it('rejects invalid stream options', () => {
    const result = validateChatRequest({
      ...validRequest,
      stream_options: { include_usage: 'yes' } as unknown as { include_usage?: boolean },
    })
    expect(result.ok).toBe(false)
  })

  it('accepts a valid request', () => {
    expect(validateChatRequest(validRequest)).toEqual({ ok: true })
  })
})