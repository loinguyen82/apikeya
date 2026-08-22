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

  it('accepts a standard assistant tool call followed by its tool result', () => {
    expect(validateChatRequest({
      model: 'demo-model',
      messages: [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' },
          }],
        },
        { role: 'tool', tool_call_id: 'call_weather', content: '{"temperature":31}' },
      ],
    })).toEqual({ ok: true })
  })

  it('rejects nullable assistant content without valid tool calls', () => {
    expect(validateChatRequest({
      model: 'demo-model',
      messages: [{ role: 'assistant', content: null }],
    })).toMatchObject({ ok: false })
    expect(validateChatRequest({
      model: 'demo-model',
      messages: [{
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: '',
          type: 'function',
          function: { name: 'get_weather', arguments: '{}' },
        }],
      }],
    })).toMatchObject({ ok: false })
  })

  it('requires tool messages to identify their tool call', () => {
    expect(validateChatRequest({
      model: 'demo-model',
      messages: [{ role: 'tool', content: 'result' }],
    })).toMatchObject({ ok: false })
  })

  it('rejects output multipliers and alternate caps that are not covered by reserve', () => {
    expect(validateChatRequest({ ...validRequest, n: 2 })).toMatchObject({ ok: false })
    expect(validateChatRequest({ ...validRequest, best_of: 3 })).toMatchObject({ ok: false })
    expect(validateChatRequest({ ...validRequest, max_output_tokens: 500 })).toMatchObject({ ok: false })
    expect(validateChatRequest({ ...validRequest, max_new_tokens: 500 })).toMatchObject({ ok: false })
  })
})
