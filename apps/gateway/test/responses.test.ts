import { describe, expect, it } from 'vitest'
import {
  toChatRequest,
  transformResponsePayloadStream,
  transformResponseStream,
} from '../src/routes/responses.js'

async function streamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

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

  it('maps Responses tools, function calls, and function outputs to a chat tool loop', () => {
    const chat = toChatRequest({
      model: 'gpt-5.6-luna',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Weather?' }] },
        { type: 'function_call', call_id: 'call_weather', name: 'get_weather', arguments: '{"city":"Hanoi"}' },
        { type: 'function_call_output', call_id: 'call_weather', output: '{"temperature":31}' },
      ],
      tools: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get the weather',
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
        strict: true,
      }],
      tool_choice: { type: 'function', name: 'get_weather' },
      parallel_tool_calls: false,
    })

    expect(chat.messages).toEqual([
      { role: 'user', content: 'Weather?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_weather',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' },
        }],
      },
      { role: 'tool', content: '{"temperature":31}', tool_call_id: 'call_weather' },
    ])
    expect(chat.tools).toEqual([{
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the weather',
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
        strict: true,
      },
    }])
    expect(chat.tool_choice).toEqual({ type: 'function', function: { name: 'get_weather' } })
    expect(chat.parallel_tool_calls).toBe(false)
  })

  it('does not drop a final SSE frame that has no trailing blank line', async () => {
    const encoder = new TextEncoder()
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"content":"last"}}],"usage":{"prompt_tokens":2,"completion_tokens":1}}',
        ))
        controller.close()
      },
    })

    const output = await streamText(transformResponseStream(upstream, 'gpt-5.6-luna'))

    expect(output).toContain('event: response.output_text.delta')
    expect(output).toContain('"delta":"last"')
    expect(output).toContain('"output_text":"last"')
    expect(output).toContain('"total_tokens":3')
    expect(output).toContain('event: response.completed')
  })

  it('synthesizes Responses SSE when a stream request receives a metered JSON completion', async () => {
    const output = await streamText(transformResponsePayloadStream({
      gateway_request_id: 'request-1',
      choices: [{ message: { content: 'fallback text' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 2 },
    }, 'gpt-5.6-luna'))

    expect(output).toContain('event: response.output_text.delta')
    expect(output).toContain('"delta":"fallback text"')
    expect(output).toContain('"total_tokens":6')
    expect(output).toContain('event: response.completed')
    expect(output).toContain('data: [DONE]')
  })

  it('maps a JSON tool call to Responses function_call streaming events', async () => {
    const output = await streamText(transformResponsePayloadStream({
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
    }, 'gpt-5.6-luna'))

    expect(output).toContain('event: response.function_call_arguments.delta')
    expect(output).toContain('"type":"function_call"')
    expect(output).toContain('"call_id":"call_weather"')
    expect(output).toContain('"name":"get_weather"')
    expect(output).toContain('"arguments":"{\\"city\\":\\"Hanoi\\"}"')
    expect(output).not.toContain('event: response.output_text.delta')
    expect(output).toContain('event: response.completed')
  })

  it('maps streamed chat tool-call deltas to Responses function-call SSE events', async () => {
    const encoder = new TextEncoder()
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_weather","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":"}}]}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Hanoi\\"}"}}]},"finish_reason":"tool_calls"}]}',
          'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":5}}',
          'data: [DONE]',
          '',
        ].join('\n\n')))
        controller.close()
      },
    })

    const output = await streamText(transformResponseStream(upstream, 'gpt-5.6-luna'))

    expect(output).toContain('event: response.output_item.added')
    expect(output).toContain('event: response.function_call_arguments.delta')
    expect(output).toContain('event: response.function_call_arguments.done')
    expect(output).toContain('"call_id":"call_weather"')
    expect(output).toContain('"name":"get_weather"')
    expect(output).toContain('"arguments":"{\\"city\\":\\"Hanoi\\"}"')
    expect(output).not.toContain('event: response.output_text.delta')
    expect(output).toContain('"total_tokens":13')
    expect(output).toContain('event: response.completed')
  })
})
