import type { ChatCompletionRequest, ProviderFailure, TokenUsage } from '@aiapi/contracts'

export interface ProviderJsonSuccess {
  kind: 'json'
  response: Response
  payload: Record<string, unknown>
  usage: TokenUsage
  providerRequestId?: string
}

export interface ProviderStreamSuccess {
  kind: 'stream'
  response: Response
  clientStream: ReadableStream<Uint8Array>
  meterStream: ReadableStream<Uint8Array>
  providerRequestId?: string
}

export interface ParsedStreamUsage {
  usage: TokenUsage
  /** Server-observed time of the first generated SSE delta, if measurable. */
  firstTokenAt?: string
}

export type ProviderSuccess = ProviderJsonSuccess | ProviderStreamSuccess

export interface ProviderAdapter {
  id: string
  invokeChat(args: {
    baseUrl: string
    apiKey: string
    upstreamModel: string
    body: ChatCompletionRequest
    timeoutMs: number
    safeNoChargeStatuses: number[]
  }): Promise<ProviderSuccess | ProviderFailure>
  parseUsageFromSse(stream: ReadableStream<Uint8Array>): Promise<ParsedStreamUsage>
}
