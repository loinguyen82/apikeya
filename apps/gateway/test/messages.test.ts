import { describe, expect, it } from 'vitest'
import { anthropicPayload, contentText, toChatRequest } from '../src/routes/messages.js'

describe('anthropic messages adapter', () => {
  it('maps system and text messages to the internal chat request', () => {
    expect(toChatRequest({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      system: 'Be concise.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    })).toEqual({
      model: 'claude-sonnet-5',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Hello' },
      ],
      stream: false,
      temperature: undefined,
      max_completion_tokens: 512,
    })
  })

  it('rejects unsupported blocks and invalid max_tokens', () => {
    expect(() => contentText([{ type: 'image', text: '' }])).toThrow('UNSUPPORTED_CONTENT_BLOCK_IMAGE')
    expect(() => toChatRequest({ model: 'gpt-5.6-luna', messages: [{ role: 'user', content: 'Hi' }] })).toThrow('MAX_TOKENS_REQUIRED')
  })

  it('maps an OpenAI payload to an Anthropic message', () => {
    expect(anthropicPayload({
      gateway_request_id: 'request-123',
      choices: [{ message: { content: 'Hello back' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }, 'claude-sonnet-5')).toEqual({
      id: 'msg_request-123',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'Hello back' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 8 },
    })
  })
})
