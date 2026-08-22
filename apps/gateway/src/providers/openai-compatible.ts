import type { ChatCompletionRequest, ProviderFailure, TokenUsage } from '@aiapi/contracts'
import type { ParsedStreamUsage, ProviderAdapter, ProviderSuccess } from './types.js'
import { classifyRetry, requestedOutputCap } from '@aiapi/core'
import { normalizeProviderUsage, sseEventHasGeneratedOutput } from './usage.js'

const HARD_OUTPUT_CAP = 8192

function readUsage(payload: unknown): TokenUsage {
  return normalizeProviderUsage(payload)
}

function validateCompletionPayload(payload: any): void {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.choices)) {
    throw new Error('Upstream response is missing valid choices')
  }
}

function trackStream(
  stream: ReadableStream<Uint8Array>,
  onComplete: () => void,
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let completed = false
  const complete = () => {
    if (completed) return
    completed = true
    onComplete()
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      reader ??= stream.getReader()
      try {
        const result = await reader.read()
        if (result.done) {
          controller.close()
          complete()
        } else {
          controller.enqueue(result.value)
        }
      } catch (error) {
        controller.error(error)
        complete()
      }
    },
    async cancel(reason) {
      try {
        await reader?.cancel(reason)
      } finally {
        complete()
      }
    },
  })
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
        ...(args.body.max_completion_tokens != null
          ? { max_completion_tokens: requestedOutputCap(args.body, HARD_OUTPUT_CAP) }
          : args.body.max_tokens != null
          ? { max_tokens: requestedOutputCap(args.body, HARD_OUTPUT_CAP) }
          : {}),
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
      if (!response.ok) {
        try {
          const declaredNoCharge = args.safeNoChargeStatuses.includes(response.status)
          return {
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
        } finally {
          clearTimeout(timeout)
        }
      }

      const providerRequestId = response.headers.get('x-request-id') ?? undefined
      if (args.body.stream) {
        if (!response.body) {
          return {
            providerId: this.id,
            code: 'UPSTREAM_STREAM_BODY_MISSING',
            message: 'Upstream returned an empty stream body after accepting the request',
            retryClass: classifyRetry({ responseStarted: true, streamStarted: false, kind: 'network' }),
          }
        }
        const [clientStream, meterStream] = response.body.tee()
        let openStreams = 2
        const onComplete = () => {
          openStreams -= 1
          if (openStreams === 0) clearTimeout(timeout)
        }
        return {
          kind: 'stream',
          response,
          clientStream: trackStream(clientStream, onComplete),
          meterStream: trackStream(meterStream, onComplete),
          providerRequestId,
        }
      }

      try {
        const payload = (await response.json()) as Record<string, unknown>
        validateCompletionPayload(payload)
        return { kind: 'json', response, payload, usage: readUsage(payload), providerRequestId }
      } catch (error) {
        return {
          providerId: this.id,
          code: 'UPSTREAM_INVALID_RESPONSE',
          message: error instanceof Error ? error.message : 'Invalid upstream response',
          retryClass: classifyRetry({ responseStarted: true, streamStarted: false, kind: 'parse' }),
        }
      } finally {
        clearTimeout(timeout)
      }
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

  async parseUsageFromSse(stream: ReadableStream<Uint8Array>): Promise<ParsedStreamUsage> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastUsage: TokenUsage | null = null
    let firstTokenAt: string | undefined

    const consumeEvent = (event: string) => {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        let payload: unknown
        try {
          payload = JSON.parse(raw)
        } catch {
          continue
        }
        if (!firstTokenAt && sseEventHasGeneratedOutput(payload)) firstTokenAt = new Date().toISOString()
        if (typeof payload === 'object' && payload !== null && 'usage' in payload) {
          try {
            // Some compatible streams emit an early prompt-only usage snapshot.
            // Ignore it until a complete input/output usage record arrives; the
            // last complete provider snapshot remains authoritative.
            lastUsage = readUsage(payload)
          } catch {
            // Incomplete usage is metadata, not a stream failure.
          }
        }
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        consumeEvent(buffer)
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) consumeEvent(event)
    }

    if (!lastUsage) throw new Error('No final provider usage was received from the stream')
    return { usage: lastUsage, firstTokenAt }
  }
}
