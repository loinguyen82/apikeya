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
  /** Optional because the catalog must be the source of truth, not a UI fallback. */
  contextWindowTokens?: number | null
  /** Explicit tokenizer mapping for preflight counts; unknown models remain unknown. */
  tokenizerFamily?: string | null
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

export interface NormalizedTokenUsage {
  inputTokens: number | null
  cachedInputTokens: number | null
  cacheCreationInputTokens?: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  totalTokens: number | null
  /** True only when the fields came from the provider's completed response. */
  providerReported: boolean
}

/**
 * Completed provider usage accepted by the billing path. Input and output are
 * required here because a request cannot be settled without them.
 */
export type TokenUsage = Omit<NormalizedTokenUsage, 'inputTokens' | 'outputTokens'> & {
  inputTokens: number
  outputTokens: number
}

export type TokenCountAccuracy =
  | 'provider_native'
  | 'official_tokenizer'
  | 'compatible_tokenizer'
  | 'estimated'

export interface TokenCountDetails {
  cachedInputTokens?: number | null
  cacheCreationInputTokens?: number | null
  systemTokens?: number | null
  historyTokens?: number | null
  currentMessageTokens?: number | null
  toolTokens?: number | null
  otherTokens?: number | null
  overheadTokens?: number | null
}

export interface TokenCountResult {
  tokens: number
  accuracy: TokenCountAccuracy
  provider: string
  model: string
  details?: TokenCountDetails
}

export interface HexaMessage {
  role: string
  content?: unknown
  [key: string]: unknown
}

export interface HexaTextInput {
  type: 'text'
  text: string
}

/**
 * Mirrors a chat payload instead of flattening it. Additional fields are kept
 * so callers can include provider-specific request fields without executing
 * them.
 */
export interface HexaConversationInput {
  type: 'conversation'
  messages: HexaMessage[]
  system?: unknown
  tools?: unknown
  [key: string]: unknown
}

export type HexaCountInput = HexaTextInput | HexaConversationInput

export interface HexaMessageCount {
  index: number
  role: string
  label: string
  tokens: number
}

export interface HexaContextGrowthPoint {
  turn: number
  inputTokens: number
  /** Null means the supplied conversation has no assistant output for this turn yet. */
  outputTokens: number | null
}

export interface HexaConversationBreakdown {
  systemTokens: number
  historyTokens: number
  currentMessageTokens: number
  toolTokens: number
  otherTokens: number
  protocolDeltaTokens: number
}

export interface HexaConversationAnalysis {
  messageCounts: HexaMessageCount[]
  breakdown: HexaConversationBreakdown
  currentContextTokens: number
  cumulativeInputTokens: number
  newContentTokens: number
  reReadContextTokens: number
  historyTax: number | null
  contextAmplification: number | null
  growth: HexaContextGrowthPoint[]
}

/** Stateless response from the authenticated Hexa counting service. */
export interface HexaAnalysis {
  model: string
  provider: string
  count: TokenCountResult
  text?: {
    characters: number
    words: number
  }
  conversation?: HexaConversationAnalysis
  contextWindowTokens: number | null
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
