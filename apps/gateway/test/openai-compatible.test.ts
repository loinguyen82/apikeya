import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleAdapter } from '../src/providers/openai-compatible.js'

const baseArgs = {
  baseUrl: 'https://provider.example',
  apiKey: 'secret',
  upstreamModel: 'upstream-model',
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

  it('marks a successful response without a stream body as unsafe', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    const result = await new OpenAICompatibleAdapter('provider').invokeChat({
      ...baseArgs,
      body: { model: 'model', messages: [{ role: 'user', content: 'hello' }], stream: true },
    })

    expect('retryClass' in result && result.retryClass).toBe('unsafe')
    expect('code' in result && result.code).toBe('UPSTREAM_STREAM_BODY_MISSING')
  })

  it('captures a server-observed first generated token while metering SSE usage', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n'))
        controller.close()
      },
    })

    const result = await new OpenAICompatibleAdapter('provider').parseUsageFromSse(stream)

    expect(result.usage).toMatchObject({ inputTokens: 5, outputTokens: 2, providerReported: true })
    expect(result.firstTokenAt).toEqual(expect.any(String))
  })

  it('ignores incomplete usage metadata and retains only the last complete usage snapshot', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{}}]}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":5}}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1}}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n'))
        controller.close()
      },
    })

    const result = await new OpenAICompatibleAdapter('provider').parseUsageFromSse(stream)

    expect(result.usage).toMatchObject({ inputTokens: 5, outputTokens: 2, totalTokens: 7 })
    expect(result.firstTokenAt).toEqual(expect.any(String))
  })
})
