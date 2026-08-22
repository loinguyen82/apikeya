import type { ChatCompletionRequest } from '@aiapi/contracts'
import type { RetailPrice } from './pricing.js'
import { chargeForUsage } from './pricing.js'

export interface ReservationPolicy {
  inputCharPerToken: number
  inputSafetyMultiplier: number
  minimumInputTokens: number
  hardOutputCap: number
  reservePaddingBps: number
}

export const DEFAULT_RESERVATION_POLICY: ReservationPolicy = {
  inputCharPerToken: 3.2,
  inputSafetyMultiplier: 1.35,
  minimumInputTokens: 64,
  hardOutputCap: 8192,
  reservePaddingBps: 500,
}

export function estimateInputTokens(body: ChatCompletionRequest, policy = DEFAULT_RESERVATION_POLICY): number {
  const messageChars = body.messages.reduce(
    (sum, message) => sum + (message.content?.length ?? 0) + (message.role?.length ?? 0) + 12,
    0,
  )
  let serializedBytes = 0
  try {
    serializedBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength
  } catch {
    // Request validation normally rejects unserializable input before reservation.
    // Retain the message-only estimate for direct library callers.
  }
  const inputUnits = Math.max(messageChars, serializedBytes)
  const raw = Math.ceil(inputUnits / policy.inputCharPerToken)
  return Math.max(policy.minimumInputTokens, Math.ceil(raw * policy.inputSafetyMultiplier))
}

export function requestedOutputCap(body: ChatCompletionRequest, modelMax: number, policy = DEFAULT_RESERVATION_POLICY): number {
  const requested = body.max_completion_tokens ?? body.max_tokens ?? modelMax
  return Math.max(1, Math.min(requested, modelMax, policy.hardOutputCap))
}

export function computeReserveMicros(
  body: ChatCompletionRequest,
  price: RetailPrice,
  modelMax: number,
  policy = DEFAULT_RESERVATION_POLICY,
): { reserveMicros: bigint; estimatedInputTokens: number; maxOutputTokens: number } {
  const estimatedInputTokens = estimateInputTokens(body, policy)
  const maxOutputTokens = requestedOutputCap(body, modelMax, policy)
  const base = chargeForUsage(price, estimatedInputTokens, maxOutputTokens)
  const padded = (base * BigInt(10_000 + policy.reservePaddingBps) + 9_999n) / 10_000n
  return { reserveMicros: padded, estimatedInputTokens, maxOutputTokens }
}
