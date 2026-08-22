import type { ChatCompletionRequest, ProviderFailure, TokenUsage } from '@aiapi/contracts'
import type { ProviderAdapter, ProviderSuccess } from './types.js'
import { classifyRetry, requestedOutputCap } from '@aiapi/core'

const HARD_OUTPUT_CAP = 8192

function readUsage(payload: any): TokenUsage {
  const usage = payload?.usage
  if (!usage || typeof usage !== 'object') {
    throw new Error('Upstream thiếu usage hợp lệ')
  }

  const inputRaw = usage.prompt_tokens ?? usage.input_tokens
  const outputRaw = usage.completion_tokens ?? usage.output_tokens
  const inputTokens = Number(inputRaw)
  const outputTokens = Number(outputRaw)
  if (
    (typeof inputRaw !== 'number' && typeof inputRaw !== 'string') ||
    (typeof outputRaw !== 'number' && typeof outputRaw !== 'string') ||
    (typeof inputRaw === 'string' && inputRaw.trim() === '') ||
    (typeof outputRaw === 'string' && outputRaw.trim() === '') ||
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    throw new Error('Upstream thiếu usage hợp lệ')
  }
  return { inputTokens, outputTokens }
}

function validateCompletionPayload(payload: any): void {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.choices)) {
    throw new Error('Upstream response thiếu choices hợp lệ')
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
        reader ??= stream.getReader()
        await reader.cancel(reason)
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
    outputCap: number
    timeoutMs: number
    safeNoChargeStatuses: number[]
  }): Promise<ProviderSuccess | ProviderFailure> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort('upstream_timeout'), args.timeoutMs)
    try {
      const reservedOutputCap = Math.max(1, Math.min(args.outputCap, HARD_OUTPUT_CAP))
      const requestedCap = requestedOutputCap(args.body, HARD_OUTPUT_CAP)
      const forwardedOutputCap = Math.min(reservedOutputCap, requestedCap)
      const outputLimit = args.body.max_completion_tokens != null
        ? { max_completion_tokens: forwardedOutputCap }
        : { max_tokens: forwardedOutputCap }

      const body: ChatCompletionRequest = {
        ...args.body,
        model: args.upstreamModel,
        ...(args.body.stream ? { stream_options: { include_usage: true } } : {}),
      }
      delete body.max_tokens
      delete body.max_completion_tokens
      delete body.max_output_tokens
      delete body.max_new_tokens
      delete body.best_of
      body.n = 1
      Object.assign(body, outputLimit)
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
        const declaredNoCharge = args.safeNoChargeStatuses.includes(response.status)
        let message = `Upstream returned HTTP ${response.status}`
        try {
          message = (await response.text()).slice(0, 500) || message
        } catch (error) {
          console.error('failed to read upstream error body', { providerId: this.id, status: response.status, error })
        } finally {
          clearTimeout(timeout)
        }
        const failure: ProviderFailure = {
          providerId: this.id,
          code: `UPSTREAM_HTTP_${response.status}`,
          message,
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
        if (!response.body) {
          clearTimeout(timeout)
          return {
            providerId: this.id,
            code: 'UPSTREAM_STREAM_BODY_MISSING',
            message: 'Upstream returned an empty stream body after accepting the request',
            retryClass: classifyRetry({ responseStarted: true, streamStarted: false, kind: 'network' }),
          }
        }
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
        if (contentType.includes('text/event-stream')) {
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

  async parseUsageFromSse(stream: ReadableStream<Uint8Array>): Promise<TokenUsage> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastUsage: TokenUsage | null = null
    const consumeEvent = (event: string) => {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        let payload: any
        try {
          payload = JSON.parse(raw)
        } catch {
          continue
        }
        if (payload.usage) lastUsage = readUsage(payload)
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
    if (!lastUsage) throw new Error('Không nhận được usage cuối stream')
    return lastUsage
  }
}
