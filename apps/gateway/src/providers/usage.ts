import type { TokenUsage } from '@aiapi/contracts'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tokenValue(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function firstTokenValue(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = tokenValue(value)
    if (parsed != null) return parsed
  }
  return null
}

/**
 * Normalizes known provider-reported usage shapes without deriving cache reads
 * from another token field. Cache creation and cache reads remain distinct.
 */
export function normalizeProviderUsage(payload: unknown): TokenUsage {
  const root = isRecord(payload) ? payload : {}
  // The current gateway only wires an OpenAI-compatible adapter. Keep this
  // normalizer scoped to fields that adapter can actually return instead of
  // adding speculative native-provider semantics.
  const usage = isRecord(root.usage) ? root.usage : root
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {}
  const inputDetails = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {}
  const completionDetails = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {}
  const outputDetails = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {}

  const inputTokens = firstTokenValue(
    usage.prompt_tokens,
    usage.input_tokens,
  )
  const outputTokens = firstTokenValue(
    usage.completion_tokens,
    usage.output_tokens,
  )

  if (inputTokens == null || outputTokens == null) {
    throw new Error('Upstream usage is missing valid input or output token counts')
  }

  return {
    inputTokens,
    outputTokens,
    // Cache read/input semantics only. Never infer this by subtracting totals.
    cachedInputTokens: firstTokenValue(
      promptDetails.cached_tokens,
      inputDetails.cached_tokens,
      usage.cached_tokens,
      usage.cache_read_input_tokens,
      usage.cache_hit_input_tokens,
      usage.prompt_cache_hit_tokens,
    ),
    // Preserve an explicitly reported cache-creation value separately from a
    // cache read. It is never inferred from input tokens.
    cacheCreationInputTokens: firstTokenValue(
      usage.cache_creation_input_tokens,
      usage.cache_creation_tokens,
      usage.cacheCreationInputTokens,
    ),
    reasoningTokens: firstTokenValue(
      completionDetails.reasoning_tokens,
      outputDetails.reasoning_tokens,
      usage.reasoning_tokens,
      usage.thinking_tokens,
    ),
    // Keep this null if the provider did not report a total explicitly.
    totalTokens: firstTokenValue(usage.total_tokens),
    providerReported: true,
  }
}

function nonEmptyFunctionCall(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (typeof value.name === 'string' && value.name.length > 0)
    || (typeof value.arguments === 'string' && value.arguments.length > 0)
}

function nonEmptyToolCall(value: unknown): boolean {
  if (!isRecord(value)) return false
  return nonEmptyFunctionCall(value.function)
    || (typeof value.name === 'string' && value.name.length > 0)
    || (typeof value.arguments === 'string' && value.arguments.length > 0)
}

function nonEmptyOutput(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.some(nonEmptyOutput)
  if (!isRecord(value)) return false
  if (Array.isArray(value.tool_calls) && value.tool_calls.some(nonEmptyToolCall)) return true
  if (nonEmptyFunctionCall(value.function_call)) return true
  return [value.text, value.content, value.reasoning_content, value.reasoning, value.thinking]
    .some(nonEmptyOutput)
}

/** Returns true when an SSE event contains generated output, including reasoning/tool deltas. */
export function sseEventHasGeneratedOutput(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  const firstChoice = Array.isArray(payload.choices) ? payload.choices[0] : undefined
  if (isRecord(firstChoice) && (nonEmptyOutput(firstChoice.delta) || nonEmptyOutput(firstChoice.message))) return true

  const firstCandidate = Array.isArray(payload.candidates) ? payload.candidates[0] : undefined
  if (isRecord(firstCandidate) && nonEmptyOutput(firstCandidate.content)) return true

  return nonEmptyOutput(payload.delta) || nonEmptyOutput(payload.output)
}
