import { describe, expect, it } from 'vitest'
import {
  anthropicPayload,
  contentText,
  toChatRequest,
  transformAnthropicPayloadStream,
  transformAnthropicStream,
} from '../src/routes/messages.js'

async function streamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

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

  it('maps Anthropic tools, tool choice, tool_use, and tool_result into an OpenAI tool loop', () => {
    expect(toChatRequest({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      tools: [{
        name: 'get_weather',
        description: 'Get the current weather.',
        input_schema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
        strict: true,
      }],
      tool_choice: {
        type: 'tool',
        name: 'get_weather',
        disable_parallel_tool_use: true,
      },
      messages: [
        {
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: 'call_weather',
            name: 'get_weather',
            input: { city: 'Hanoi' },
          }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_weather',
              content: [{ type: 'text', text: '31 C' }],
            },
            { type: 'text', text: 'Summarize that.' },
          ],
        },
      ],
    })).toEqual({
      model: 'claude-sonnet-5',
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' },
          }],
        },
        { role: 'tool', content: '31 C', tool_call_id: 'call_weather' },
        { role: 'user', content: 'Summarize that.' },
      ],
      stream: false,
      temperature: undefined,
      max_completion_tokens: 512,
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather.',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
          strict: true,
        },
      }],
      tool_choice: { type: 'function', function: { name: 'get_weather' } },
      parallel_tool_calls: false,
    })

    expect(toChatRequest({
      model: 'claude-sonnet-5',
      max_tokens: 64,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: 'Use a tool.' }],
    })).toMatchObject({ tool_choice: 'required' })
  })

  it('keeps assistant text alongside tool calls', () => {
    expect(toChatRequest({
      model: 'claude-sonnet-5',
      max_tokens: 128,
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will check. ' },
          { type: 'text', text: 'One moment.' },
          { type: 'tool_use', id: 'call_1', name: 'lookup', input: { q: 'status' } },
        ],
      }],
    }).messages).toEqual([{
      role: 'assistant',
      content: 'I will check. One moment.',
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'lookup', arguments: '{"q":"status"}' },
      }],
    }])
  })

  it('synthesizes Anthropic SSE when a stream request receives a metered JSON completion', async () => {
    const output = await streamText(transformAnthropicPayloadStream({
      gateway_request_id: 'request-123',
      choices: [{ message: { content: 'fallback text' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }, 'claude-sonnet-5'))

    expect(output).toContain('event: message_start')
    expect(output).toContain('event: content_block_delta')
    expect(output).toContain('"text":"fallback text"')
    expect(output).toContain('"input_tokens":12')
    expect(output).toContain('"output_tokens":8')
    expect(output).toContain('event: message_stop')
  })

  it('does not drop a final provider SSE frame without a trailing blank line', async () => {
    const encoder = new TextEncoder()
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"content":"last"}}],"usage":{"prompt_tokens":2,"completion_tokens":1}}',
        ))
        controller.close()
      },
    })

    const output = await streamText(transformAnthropicStream(upstream, 'claude-sonnet-5'))

    expect(output).toContain('"text":"last"')
    expect(output).toContain('"output_tokens":1')
    expect(output).toContain('event: message_stop')
  })

  it('maps a JSON tool call to Anthropic tool_use content and streaming events', async () => {
    const payload = {
      gateway_request_id: 'request-tool',
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call_weather',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 8, completion_tokens: 5 },
    }

    expect(anthropicPayload(payload, 'claude-sonnet-5')).toMatchObject({
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        id: 'call_weather',
        name: 'get_weather',
        input: { city: 'Hanoi' },
      }],
    })

    const output = await streamText(transformAnthropicPayloadStream(payload, 'claude-sonnet-5'))
    expect(output).toContain('"type":"tool_use","id":"call_weather","name":"get_weather"')
    expect(output).toContain('"type":"input_json_delta","partial_json":"{\\"city\\":\\"Hanoi\\"}"')
    expect(output).toContain('"stop_reason":"tool_use"')
    expect(output).not.toContain('"type":"text_delta","text":""')
  })

  it('maps streamed OpenAI tool call fragments to Anthropic tool_use blocks', async () => {
    const encoder = new TextEncoder()
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode([
          'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_weather","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":"}},{"index":1,"id":"call_time","type":"function","function":{"name":"get_time","arguments":"{\\"zone\\":"}}]},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Hanoi\\"}"}},{"index":1,"function":{"arguments":"\\"UTC+7\\"}"}}]},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
          '',
          'data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":6}}',
          '',
          'data: [DONE]',
        ].join('\n')))
        controller.close()
      },
    })

    const output = await streamText(transformAnthropicStream(upstream, 'claude-sonnet-5'))

    expect(output).toContain('"type":"tool_use","id":"call_weather","name":"get_weather","input":{}')
    expect(output).toContain('"type":"tool_use","id":"call_time","name":"get_time","input":{}')
    expect(output).toContain('"type":"input_json_delta","partial_json":"{\\"city\\":"')
    expect(output).toContain('"type":"input_json_delta","partial_json":"\\"Hanoi\\"}"')
    expect(output).toContain('"type":"input_json_delta","partial_json":"{\\"zone\\":"')
    expect(output).toContain('"type":"input_json_delta","partial_json":"\\"UTC+7\\"}"')
    expect(output).toContain('"stop_reason":"tool_use"')
    expect(output).toContain('"output_tokens":6')
    expect(output).not.toContain('"content_block":{"type":"text"')
  })
})
