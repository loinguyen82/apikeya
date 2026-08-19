import type { ChatCompletionRequest, ProviderFailure } from '@aiapi/contracts'
import { chargeForUsage, computeReserveMicros, upstreamCostForUsage } from '@aiapi/core'
import type { Env } from '../env.js'
import { adminDb } from '../repositories/supabase.js'
import { loadRuntimeModel } from './catalog.js'
import { markAmbiguous, releaseRequest, reserveRequest, settleRequest } from './billing.js'
import { newId } from '../utils/id.js'
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.js'

function retailPrice(model: Awaited<ReturnType<typeof loadRuntimeModel>>) {
  if (model.pricingMode === 'flat_total') {
    if (!model.retailFlatMicrosPerMToken) throw new Error('MODEL_PRICE_MISSING')
    return { mode: 'flat_total' as const, flatMicrosPerMToken: model.retailFlatMicrosPerMToken }
  }
  if (!model.retailInputMicrosPerMToken || !model.retailOutputMicrosPerMToken) {
    throw new Error('MODEL_PRICE_MISSING')
  }
  return {
    mode: 'split_io' as const,
    inputMicrosPerMToken: model.retailInputMicrosPerMToken,
    outputMicrosPerMToken: model.retailOutputMicrosPerMToken,
  }
}

function upstreamSecrets(env: Env): Record<string, string> {
  return { A6API_KEY: env.A6API_KEY, NECO_KEY: env.NECO_KEY }
}

async function markAmbiguousBestEffort(db: ReturnType<typeof adminDb>, requestId: string, errorCode: string) {
  try {
    await markAmbiguous(db, requestId, errorCode)
  } catch (error) {
    console.error('failed to mark request ambiguous', { requestId, error })
  }
}

function internalFailure(requestId: string, message: string): Response {
  return Response.json(
    { error: { message, type: 'server_error', request_id: requestId } },
    { status: 500, headers: { 'x-request-id': requestId } },
  )
}

export async function executeChat(args: {
  env: Env
  body: ChatCompletionRequest
  userId: string
  apiKeyId: string | null
  channel: 'api' | 'playground'
  idempotencyKey?: string
  executionCtx?: { waitUntil: (promise: Promise<any>) => void }
}): Promise<Response> {
  const db = adminDb(args.env)
  const model = await loadRuntimeModel(db, args.body.model, upstreamSecrets(args.env))
  if (args.body.stream && !model.streamingEnabled) {
    return Response.json(
      { error: { message: 'Model này chưa hỗ trợ stream qua gateway', type: 'invalid_request_error' } },
      { status: 400 }
    )
  }
  const price = retailPrice(model)
  const reserve = computeReserveMicros(args.body, price, model.maxOutputTokens)
  const requestId = newId()
  const reservedRow = await reserveRequest(db, {
    requestId,
    userId: args.userId,
    apiKeyId: args.apiKeyId,
    channel: args.channel,
    modelId: model.id,
    reserveMicros: reserve.reserveMicros,
    idempotencyKey: args.idempotencyKey,
    pricingMode: price.mode,
    retailFlatMicrosPerMToken: price.mode === 'flat_total' ? price.flatMicrosPerMToken : null,
    retailInputMicrosPerMToken: price.mode === 'split_io' ? price.inputMicrosPerMToken : null,
    retailOutputMicrosPerMToken: price.mode === 'split_io' ? price.outputMicrosPerMToken : null,
    estimatedInputTokens: reserve.estimatedInputTokens,
    maxOutputTokens: reserve.maxOutputTokens,
  })

  if (reservedRow.id !== requestId) {
    return Response.json(
      {
        error: {
          message: 'Idempotency-Key này đã được dùng. Gateway không dispatch lại để tránh tạo hai tác vụ AI.',
          type: 'idempotency_replay',
          request_id: reservedRow.id,
          status: reservedRow.status,
        },
      },
      { status: 409, headers: { 'x-request-id': reservedRow.id } }
    )
  }

  let lastFailure: ProviderFailure | null = null
  for (const candidate of model.providers) {
    if (args.body.stream && !candidate.supportsStreamUsage) continue
    const adapter = new OpenAICompatibleAdapter(candidate.providerId)
    const { error: dispatchError } = await db
      .from('api_requests')
      .update({ status: 'dispatching', provider_id: candidate.providerId })
      .eq('id', requestId)
    if (dispatchError) {
      await markAmbiguousBestEffort(db, requestId, 'DISPATCH_AUDIT_WRITE_FAILED')
      return internalFailure(requestId, 'Gateway không thể ghi nhận trạng thái request')
    }
    const { data: attempt, error: attemptError } = await db
      .from('provider_attempts')
      .insert({
        api_request_id: requestId,
        provider_id: candidate.providerId,
        upstream_model: candidate.upstreamModel,
        priority_snapshot: candidate.priority,
        upstream_input_micros_per_mtoken_snapshot: candidate.upstreamInputMicrosPerMToken,
        upstream_output_micros_per_mtoken_snapshot: candidate.upstreamOutputMicrosPerMToken,
        status: 'dispatching',
      })
      .select('id')
      .single()

    if (attemptError || !attempt) {
      await markAmbiguousBestEffort(db, requestId, 'ATTEMPT_AUDIT_WRITE_FAILED')
      return internalFailure(requestId, 'Gateway không thể ghi nhận lượt gọi upstream an toàn')
    }

    const result = await adapter.invokeChat({
      baseUrl: candidate.baseUrl,
      apiKey: candidate.apiKey,
      upstreamModel: candidate.upstreamModel,
      body: args.body,
      timeoutMs: candidate.timeoutMs,
      safeNoChargeStatuses: candidate.safeNoChargeStatuses,
    })

    if ('retryClass' in result) {
      lastFailure = result
      const { error: attemptUpdateError } = await db
        .from('provider_attempts')
        .update({
          status: result.retryClass === 'safe' ? 'safe_failed' : 'ambiguous_failed',
          error_code: result.code,
          completed_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)

      if (attemptUpdateError) {
        await markAmbiguousBestEffort(db, requestId, 'PROVIDER_FAILURE_AUDIT_WRITE_FAILED')
        return internalFailure(requestId, 'Gateway không thể ghi nhận kết quả upstream')
      }

      if (result.retryClass === 'safe') continue

      await markAmbiguousBestEffort(db, requestId, result.code)
      return Response.json(
        {
          error: {
            message: 'Upstream chưa phản hồi chắc chắn. Request không được tự gửi sang nguồn khác để tránh xử lý trùng.',
            type: 'upstream_error',
            request_id: requestId,
          },
        },
        { status: 502, headers: { 'x-request-id': requestId } }
      )
    }

    if (result.kind === 'json') {
      const retailCost = chargeForUsage(price, result.usage.inputTokens, result.usage.outputTokens)
      const upstreamCost = upstreamCostForUsage(
        candidate.upstreamInputMicrosPerMToken,
        candidate.upstreamOutputMicrosPerMToken,
        result.usage.inputTokens,
        result.usage.outputTokens
      )
      const { error: attemptUpdateError } = await db
        .from('provider_attempts')
        .update({
          status: 'succeeded',
          provider_request_id: result.providerRequestId ?? null,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          completed_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)

      if (attemptUpdateError) {
        await markAmbiguousBestEffort(db, requestId, 'PROVIDER_SUCCESS_AUDIT_WRITE_FAILED')
        return internalFailure(requestId, 'Gateway không thể ghi nhận kết quả upstream')
      }

      try {
        await settleRequest(db, {
          requestId,
          retailCostMicros: retailCost,
          upstreamCostMicros: upstreamCost,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          providerId: candidate.providerId,
          providerRequestId: result.providerRequestId,
        })
      } catch (error) {
        console.error('request settlement failed after provider success', { requestId, error })
        await markAmbiguousBestEffort(db, requestId, 'SETTLEMENT_RECONCILE_REQUIRED')
        return internalFailure(requestId, 'Gateway chưa thể xác nhận quyết toán request')
      }

      const payload = { ...result.payload, gateway_request_id: requestId }
      return Response.json(payload, { status: 200, headers: { 'x-request-id': requestId } })
    }

    const { error: streamingAttemptError } = await db
      .from('provider_attempts')
      .update({ status: 'streaming', provider_request_id: result.providerRequestId ?? null })
      .eq('id', attempt.id)
    const { error: streamingRequestError } = await db
      .from('api_requests')
      .update({ status: 'streaming', provider_id: candidate.providerId, provider_request_id: result.providerRequestId ?? null })
      .eq('id', requestId)
    if (streamingAttemptError || streamingRequestError) {
      await Promise.allSettled([result.clientStream.cancel(), result.meterStream.cancel()])
      await markAmbiguousBestEffort(db, requestId, 'STREAMING_AUDIT_WRITE_FAILED')
      return internalFailure(requestId, 'Gateway không thể ghi nhận trạng thái stream')
    }

    const backgroundPromise = (async () => {
      try {
        const usage = await adapter.parseUsageFromSse(result.meterStream)
        const retailCost = chargeForUsage(price, usage.inputTokens, usage.outputTokens)
        const upstreamCost = upstreamCostForUsage(
          candidate.upstreamInputMicrosPerMToken,
          candidate.upstreamOutputMicrosPerMToken,
          usage.inputTokens,
          usage.outputTokens
        )
        const { error: completionAuditError } = await db
          .from('provider_attempts')
          .update({
            status: 'succeeded',
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            completed_at: new Date().toISOString(),
          })
          .eq('id', attempt.id)

        if (completionAuditError) throw new Error('STREAM_COMPLETION_AUDIT_WRITE_FAILED')

        try {
          await settleRequest(db, {
            requestId,
            retailCostMicros: retailCost,
            upstreamCostMicros: upstreamCost,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            providerId: candidate.providerId,
            providerRequestId: result.providerRequestId,
          })
        } catch (error) {
          console.error('stream settlement failed after provider success', { requestId, error })
          throw new Error('STREAM_SETTLEMENT_RECONCILE_REQUIRED')
        }
      } catch (e) {
        const { error: attemptFailureAuditError } = await db
          .from('provider_attempts')
          .update({
            status: 'ambiguous_failed',
            error_code: 'STREAM_USAGE_RECONCILE_REQUIRED',
            completed_at: new Date().toISOString(),
          })
          .eq('id', attempt.id)
        if (attemptFailureAuditError) {
          console.error('failed to record stream reconciliation failure', { requestId, error: attemptFailureAuditError })
        }
        await markAmbiguousBestEffort(db, requestId, 'STREAM_USAGE_RECONCILE_REQUIRED')
      }
    })()

    if (args.executionCtx?.waitUntil) {
      args.executionCtx.waitUntil(backgroundPromise)
    }

    return new Response(result.clientStream, {
      status: 200,
      headers: {
        'content-type': result.response.headers.get('content-type') ?? 'text/event-stream',
        'cache-control': 'no-cache',
        'x-request-id': requestId,
      },
    })
  }

  try {
    await releaseRequest(db, requestId, lastFailure?.code ?? 'NO_HEALTHY_PROVIDER')
  } catch (error) {
    console.error('request release failed', { requestId, error })
    await markAmbiguousBestEffort(db, requestId, 'RELEASE_RECONCILE_REQUIRED')
    return internalFailure(requestId, 'Gateway chưa thể hoàn tất trạng thái request')
  }
  return Response.json(
    { error: { message: 'Hiện chưa có nguồn khả dụng cho model này', type: 'upstream_unavailable' } },
    { status: 503, headers: { 'x-request-id': requestId } }
  )
}
