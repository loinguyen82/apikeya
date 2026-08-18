import type { ChatCompletionRequest, ProviderFailure, TokenUsage } from '@aiapi/contracts'
import type { ProviderAdapter, ProviderSuccess } from './types'
import { classifyRetry } from '@aiapi/core'

function readUsage(payload: any): TokenUsage {
  const usage = payload?.usage
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0)
  const outputTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0)
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    throw new Error('Upstream thiếu usage hợp lệ')
  }
  return { inputTokens, outputTokens }
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(public readonly id: string) {}

  async invokeChat(args: {
    baseUrl: string
    apiKey: string
    upstreamModel: string
    body: ChatCompletionRequest
    timeoutMs: number
    safeNoChargeStatuses: number[]
  }): Promise<ProviderSuccess | ProviderFailure> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort('upstream_timeout'), args.timeoutMs)
    try {
      const body = {
        ...args.body,
        model: args.upstreamModel,
        ...(args.body.stream ? { stream_options: { include_usage: true } } : {}),
      }
      const response = await fetch(`${args.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${args.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!response.ok) {
        const declaredNoCharge = args.safeNoChargeStatuses.includes(response.status)
        const failure: ProviderFailure = {
          providerId: this.id,
          code: `UPSTREAM_HTTP_${response.status}`,
          message: (await response.text()).slice(0, 500),
          httpStatus: response.status,
          retryClass: classifyRetry({
            responseStarted: false,
            streamStarted: false,
            kind: 'http',
            adapterDeclaredNoCharge: declaredNoCharge,
            httpStatus: response.status,
          }),
        }
        return failure
      }
      const providerRequestId = response.headers.get('x-request-id') ?? undefined
      if (args.body.stream) {
        if (!response.body) throw new Error('Upstream stream body missing')
        const [clientStream, meterStream] = response.body.tee()
        return { kind: 'stream', response, clientStream, meterStream, providerRequestId }
      }
      const payload = (await response.json()) as Record<string, unknown>
      return { kind: 'json', response, payload, usage: readUsage(payload), providerRequestId }
    } catch (error) {
      clearTimeout(timeout)
      const isTimeout = controller.signal.aborted
      return {
        providerId: this.id,
        code: isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK',
        message: error instanceof Error ? error.message : 'Unknown upstream failure',
        retryClass: classifyRetry({
          responseStarted: false,
          streamStarted: false,
          kind: isTimeout ? 'timeout' : 'network',
        }),
      }
    }
  }

  async parseUsageFromSse(stream: ReadableStream<Uint8Array>): Promise<TokenUsage> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastUsage: TokenUsage | null = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw || raw === '[DONE]') continue
          try {
            const payload = JSON.parse(raw)
            if (payload.usage) lastUsage = readUsage(payload)
          } catch {
            /* ignore non-json event */
          }
        }
      }
    }
    if (!lastUsage) throw new Error('Không nhận được usage cuối stream')
    return lastUsage
  }
}
