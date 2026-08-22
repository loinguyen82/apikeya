import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleAdapter } from '../src/providers/openai-compatible.js'

const baseArgs = {
  baseUrl: 'https://provider.example',
  apiKey: 'secret',
  upstreamModel: 'upstream-model',
  outputCap: 8192,
  timeoutMs: 1000,
  safeNoChargeStatuses: [],
}

afterEach(() => vi.restoreAllMocks())

describe('OpenAICompatibleAdapter', () => {
  it('clamps the forwarded output cap to the reservation hard cap', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
        status: 200,
        headers: { 'x-request-id': 'req-1' },
      }),
    )

    await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      body: { model: 'model', messages: [{ role: 'user', content: 'hello' }], max_tokens: 100000 },
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body)).max_tokens).toBe(8192)
  })

  it('adds the reserved output cap when the client omits max tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 }),
    )

    await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      outputCap: 4096,
      body: { model: 'model', messages: [{ role: 'user', content: 'hello' }] },
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body)).max_tokens).toBe(4096)
  })

  it('preserves max_completion_tokens semantics while applying the cap', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 }),
    )

    await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      outputCap: 2048,
      body: {
        model: 'model',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 100_000,
        max_completion_tokens: 9000,
      },
    })

    const forwarded = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(forwarded.max_completion_tokens).toBe(2048)
    expect(forwarded).not.toHaveProperty('max_tokens')
  })

  it('forwards assistant tool calls and matching tool results without rewriting them', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'It is 31 C.' } }],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
      }), { status: 200 }),
    )

    await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      body: {
        model: 'model',
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
          { role: 'tool', content: '{"temperature":31}', tool_call_id: 'call_weather' },
        ],
        tools: [{
          type: 'function',
          function: { name: 'get_weather', parameters: { type: 'object' } },
        }],
      },
    })

    const forwarded = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(forwarded.messages).toEqual([
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
    expect(forwarded.tools).toEqual([{
      type: 'function',
      function: { name: 'get_weather', parameters: { type: 'object' } },
    }])
  })

  it('forces a single completion and strips alternate output amplifiers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 }),
    )

    await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      body: {
        model: 'model',
        messages: [{ role: 'user', content: 'hello' }],
        n: 50,
        best_of: 50,
        max_output_tokens: 100_000,
        max_new_tokens: 100_000,
      },
    })

    const forwarded = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(forwarded.n).toBe(1)
    expect(forwarded).not.toHaveProperty('best_of')
    expect(forwarded).not.toHaveProperty('max_output_tokens')
    expect(forwarded).not.toHaveProperty('max_new_tokens')
    expect(forwarded.max_tokens).toBe(8192)
  })

  it('marks a successful response without a stream body as unsafe', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    const result = await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      body: { model: 'model', messages: [{ role: 'user', content: 'hello' }], stream: true },
    })

    expect('retryClass' in result && result.retryClass).toBe('unsafe')
    expect('code' in result && result.code).toBe('UPSTREAM_STREAM_BODY_MISSING')
  })

  it('meters a JSON completion when a provider ignores stream=true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'fallback' } }],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      body: { model: 'model', messages: [{ role: 'user', content: 'hello' }], stream: true },
    })

    expect(result).toMatchObject({
      kind: 'json',
      usage: { inputTokens: 7, outputTokens: 3 },
    })
  })

  it('keeps a declared no-charge HTTP status safe when its error body cannot be read', async () => {
    const brokenBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('broken error body'))
      },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(brokenBody, { status: 401 }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      safeNoChargeStatuses: [401],
      body: { model: 'model', messages: [{ role: 'user', content: 'hello' }] },
    })

    expect(result).toMatchObject({
      code: 'UPSTREAM_HTTP_401',
      httpStatus: 401,
      retryClass: 'safe',
    })
  })
})
