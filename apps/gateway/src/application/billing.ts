import type { SupabaseClient } from '@supabase/supabase-js'
import type { TokenUsage } from '@aiapi/contracts'
import { rpcOrThrow } from '../repositories/supabase.js'

export async function reserveRequest(
  db: SupabaseClient,
  input: {
    requestId: string
    userId: string
    apiKeyId: string | null
    channel: 'api' | 'playground'
    modelId: string
    requestedModelId: string
    reserveMicros: bigint
    idempotencyKey?: string
    pricingMode: 'flat_total' | 'split_io'
    retailFlatMicrosPerMToken?: string | bigint | null
    retailInputMicrosPerMToken?: string | bigint | null
    retailOutputMicrosPerMToken?: string | bigint | null
    estimatedInputTokens: number
    maxOutputTokens: number
    stream: boolean
  }
) {
  return rpcOrThrow<any>(
    db.rpc('reserve_api_request', {
      p_request_id: input.requestId,
      p_user_id: input.userId,
      p_api_key_id: input.apiKeyId,
      p_channel: input.channel,
      p_model_id: input.modelId,
      p_requested_model_id: input.requestedModelId,
      p_reserve_micros: input.reserveMicros.toString(),
      p_idempotency_key: input.idempotencyKey ?? null,
      p_pricing_mode_snapshot: input.pricingMode,
      p_retail_flat_snapshot: input.retailFlatMicrosPerMToken == null ? null : input.retailFlatMicrosPerMToken.toString(),
      p_retail_input_snapshot: input.retailInputMicrosPerMToken == null ? null : input.retailInputMicrosPerMToken.toString(),
      p_retail_output_snapshot: input.retailOutputMicrosPerMToken == null ? null : input.retailOutputMicrosPerMToken.toString(),
      p_estimated_input_tokens: input.estimatedInputTokens,
      p_max_output_tokens: input.maxOutputTokens,
      p_stream: input.stream,
    })
  )
}

export async function settleRequest(
  db: SupabaseClient,
  input: {
    requestId: string
    retailCostMicros: bigint
    upstreamCostMicros: bigint
    usage: TokenUsage
    providerId: string
    providerRequestId?: string
    firstTokenAt?: string
  }
) {
  return rpcOrThrow<any>(
    db.rpc('settle_api_request', {
      p_request_id: input.requestId,
      p_retail_cost_micros: input.retailCostMicros.toString(),
      p_upstream_cost_micros: input.upstreamCostMicros.toString(),
      p_input_tokens: input.usage.inputTokens,
      p_cached_input_tokens: input.usage.cachedInputTokens,
      p_cache_creation_input_tokens: input.usage.cacheCreationInputTokens ?? null,
      p_output_tokens: input.usage.outputTokens,
      p_reasoning_tokens: input.usage.reasoningTokens,
      p_total_tokens: input.usage.totalTokens,
      p_provider_id: input.providerId,
      p_provider_request_id: input.providerRequestId ?? null,
      p_first_token_at: input.firstTokenAt ?? null,
    })
  )
}

export async function releaseRequest(db: SupabaseClient, requestId: string, errorCode: string) {
  return rpcOrThrow<any>(
    db.rpc('release_api_request', {
      p_request_id: requestId,
      p_error_code: errorCode,
    })
  )
}

export async function markAmbiguous(db: SupabaseClient, requestId: string, errorCode: string) {
  const { error } = await db
    .from('api_requests')
    .update({ status: 'failed_ambiguous', error_code: errorCode })
    .eq('id', requestId)
    .in('status', ['reserved', 'dispatching', 'streaming'])
  if (error) throw new Error(error.message)
}
