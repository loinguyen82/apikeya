import { describe, expect, it } from 'vitest'
import { toChatRequest } from '../src/routes/responses.js'

describe('Responses API translation', () => {
  it('preserves stream=true so the gateway can stream upstream end-to-end', () => {
    const chat = toChatRequest({
      model: 'kimi-k2.6',
      input: 'hello',
      stream: true,
      max_output_tokens: 512,
    })

    expect(chat.stream).toBe(true)
    expect(chat.max_completion_tokens).toBe(512)
    expect(chat.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('maps developer instructions and structured text content to chat messages', () => {
    const chat = toChatRequest({
      model: 'gpt-5.6-luna',
      instructions: 'Be concise',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'Follow policy' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'Say hi' }] },
      ],
    })

    expect(chat.messages).toEqual([
      { role: 'system', content: 'Be concise' },
      { role: 'system', content: 'Follow policy' },
      { role: 'user', content: 'Say hi' },
    ])
  })
})
