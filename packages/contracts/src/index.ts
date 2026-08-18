export type UUID = string
export type MoneyMicros = string // PostgreSQL bigint serialized as decimal string. 1 VND = 1000 micros.

export type ModelStatus = 'active' | 'degraded' | 'disabled'
export type ProviderStatus = 'healthy' | 'degraded' | 'disabled'
export type RequestChannel = 'api' | 'playground'

export type ApiRequestStatus =
  | 'reserved'
  | 'dispatching'
  | 'streaming'
  | 'settled'
  | 'released'
  | 'failed_ambiguous'

export type RetryClass = 'safe' | 'unsafe' | 'not_applicable'

export interface ModelCatalogItem {
  id: string
  displayName: string
  description: string
  tags: string[]
  status: ModelStatus
  pricingMode: 'flat_total' | 'split_io'
  retailFlatMicrosPerMToken: MoneyMicros | null
  retailInputMicrosPerMToken: MoneyMicros | null
  retailOutputMicrosPerMToken: MoneyMicros | null
  defaultMaxOutputTokens: number
  maxOutputTokens: number
  streamingEnabled: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  max_completion_tokens?: number
  stream_options?: { include_usage?: boolean }
  [key: string]: unknown
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface ProviderCandidate {
  providerId: string
  baseUrl: string
  apiKey: string
  upstreamModel: string
  timeoutMs: number
  priority: number
  supportsStreamUsage: boolean
  safeNoChargeStatuses: number[]
  upstreamInputMicrosPerMToken: MoneyMicros
  upstreamOutputMicrosPerMToken: MoneyMicros
}

export interface ProviderFailure {
  providerId: string
  code: string
  message: string
  retryClass: RetryClass
  httpStatus?: number
}
