import { TOKENS_PER_MILLION, asBigInt, ceilDiv } from './money'

export interface FlatRetailPrice {
  mode: 'flat_total'
  flatMicrosPerMToken: string | bigint
}

export interface SplitRetailPrice {
  mode: 'split_io'
  inputMicrosPerMToken: string | bigint
  outputMicrosPerMToken: string | bigint
}

export type RetailPrice = FlatRetailPrice | SplitRetailPrice

export function chargeForUsage(
  price: RetailPrice,
  inputTokens: number,
  outputTokens: number,
): bigint {
  if (inputTokens < 0 || outputTokens < 0) throw new Error('token counts must be non-negative')
  const input = BigInt(inputTokens)
  const output = BigInt(outputTokens)
  if (price.mode === 'flat_total') {
    return ceilDiv((input + output) * asBigInt(price.flatMicrosPerMToken), TOKENS_PER_MILLION)
  }
  return (
    ceilDiv(input * asBigInt(price.inputMicrosPerMToken), TOKENS_PER_MILLION) +
    ceilDiv(output * asBigInt(price.outputMicrosPerMToken), TOKENS_PER_MILLION)
  )
}

export function upstreamCostForUsage(
  inputMicrosPerMToken: string | bigint,
  outputMicrosPerMToken: string | bigint,
  inputTokens: number,
  outputTokens: number,
): bigint {
  return (
    ceilDiv(BigInt(inputTokens) * asBigInt(inputMicrosPerMToken), TOKENS_PER_MILLION) +
    ceilDiv(BigInt(outputTokens) * asBigInt(outputMicrosPerMToken), TOKENS_PER_MILLION)
  )
}
