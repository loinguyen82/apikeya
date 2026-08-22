import { describe, expect, it } from 'vitest'
import { transformChatPayloadStream } from '../src/routes/chat.js'

describe('Chat Completions streaming fallback', () => {
  it('synthesizes chat completion chunks from a metered JSON completion', async () => {
    const output = await new Response(transformChatPayloadStream({
      gateway_request_id: 'request-1',
      model: 'gpt-5.6-luna',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'fallback text' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    })).text()

    expect(output).toContain('"object":"chat.completion.chunk"')
    expect(output).toContain('"delta":{"role":"assistant","content":"fallback text"}')
    expect(output).toContain('"finish_reason":"stop"')
    expect(output).toContain('"total_tokens":6')
    expect(output).toContain('data: [DONE]')
  })

  it('preserves tool calls when synthesizing chat completion chunks', async () => {
    const output = await new Response(transformChatPayloadStream({
      gateway_request_id: 'request-tool',
      model: 'gpt-5.6-luna',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
    })).text()

    expect(output).toContain('"tool_calls":[{"id":"call_weather","type":"function"')
    expect(output).toContain('"index":0')
    expect(output).toContain('"finish_reason":"tool_calls"')
    expect(output).not.toContain('"content":""')
  })
})
