import type { ChatCompletionRequest } from '@aiapi/contracts'
import type { RetailPrice } from './pricing'
import { chargeForUsage } from './pricing'

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
  const chars = body.messages.reduce((sum, m) => sum + (m.content?.length ?? 0) + (m.role?.length ?? 0) + 12, 0)
  const raw = Math.ceil(chars / policy.inputCharPerToken)
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
