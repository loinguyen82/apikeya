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
})