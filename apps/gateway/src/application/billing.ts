import type { SupabaseClient } from '@supabase/supabase-js'
import { rpcOrThrow } from '../repositories/supabase'

export async function reserveRequest(
  db: SupabaseClient,
  input: {
    requestId: string
    userId: string
    apiKeyId: string | null
    channel: 'api' | 'playground'
    modelId: string
    reserveMicros: bigint
    idempotencyKey?: string
    pricingMode: 'flat_total' | 'split_io'
    retailFlatMicrosPerMToken?: string | bigint | null
    retailInputMicrosPerMToken?: string | bigint | null
    retailOutputMicrosPerMToken?: string | bigint | null
    estimatedInputTokens: number
    maxOutputTokens: number
  }
) {
  return rpcOrThrow<any>(
    db.rpc('reserve_api_request', {
      p_request_id: input.requestId,
      p_user_id: input.userId,
      p_api_key_id: input.apiKeyId,
      p_channel: input.channel,
      p_model_id: input.modelId,
      p_reserve_micros: input.reserveMicros.toString(),
      p_idempotency_key: input.idempotencyKey ?? null,
      p_pricing_mode_snapshot: input.pricingMode,
      p_retail_flat_snapshot: input.retailFlatMicrosPerMToken == null ? null : input.retailFlatMicrosPerMToken.toString(),
      p_retail_input_snapshot: input.retailInputMicrosPerMToken == null ? null : input.retailInputMicrosPerMToken.toString(),
      p_retail_output_snapshot: input.retailOutputMicrosPerMToken == null ? null : input.retailOutputMicrosPerMToken.toString(),
      p_estimated_input_tokens: input.estimatedInputTokens,
      p_max_output_tokens: input.maxOutputTokens,
    })
  )
}

export async function settleRequest(
  db: SupabaseClient,
  input: {
    requestId: string
    retailCostMicros: bigint
    upstreamCostMicros: bigint
    inputTokens: number
    outputTokens: number
    providerId: string
    providerRequestId?: string
  }
) {
  return rpcOrThrow<any>(
    db.rpc('settle_api_request', {
      p_request_id: input.requestId,
      p_retail_cost_micros: input.retailCostMicros.toString(),
      p_upstream_cost_micros: input.upstreamCostMicros.toString(),
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_provider_id: input.providerId,
      p_provider_request_id: input.providerRequestId ?? null,
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
  if (error) throw new Error(error.message)
}
