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

async function releaseKnownSafeFailure(
  db: ReturnType<typeof adminDb>,
  requestId: string,
  errorCode: string,
): Promise<void> {
  try {
    await releaseRequest(db, requestId, errorCode)
  } catch (error) {
    console.error('failed to release request after known-safe failure', { requestId, errorCode, error })
    await markAmbiguousBestEffort(db, requestId, 'RELEASE_RECONCILE_REQUIRED')
  }
}

async function auditWriteError(
  operation: () => PromiseLike<{ error: unknown }>,
): Promise<unknown | null> {
  try {
    return (await operation()).error
  } catch (error) {
    return error
  }
}

function internalFailure(requestId: string, message: string): Response {
  return Response.json(
    { error: { message, type: 'server_error', code: 'internal_error', request_id: requestId } },
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
  const startedAtMs = Date.now()
  const db = adminDb(args.env)
  const model = await loadRuntimeModel(db, args.body.model, upstreamSecrets(args.env))
  if (args.body.stream && !model.streamingEnabled) {
    return Response.json(
      { error: { message: 'Model này chưa hỗ trợ stream qua gateway', type: 'invalid_request_error', code: 'stream_not_supported' } },
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
          code: 'idempotency_replay',
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
    const dispatchError = await auditWriteError(() =>
      db
        .from('api_requests')
        .update({ status: 'dispatching', provider_id: candidate.providerId })
        .eq('id', requestId)
    )
    if (dispatchError) {
      await releaseKnownSafeFailure(db, requestId, 'DISPATCH_AUDIT_WRITE_FAILED')
      return internalFailure(requestId, 'Gateway không thể ghi nhận trạng thái request')
    }
    let attempt: { id: string } | null = null
    let attemptError: unknown = null
    try {
      const result = await db
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
      attempt = result.data
      attemptError = result.error
    } catch (error) {
      attemptError = error
    }

    if (attemptError || !attempt) {
      await releaseKnownSafeFailure(db, requestId, 'ATTEMPT_AUDIT_WRITE_FAILED')
      return internalFailure(requestId, 'Gateway không thể ghi nhận lượt gọi upstream an toàn')
    }

    let result: Awaited<ReturnType<OpenAICompatibleAdapter['invokeChat']>>
    try {
      result = await adapter.invokeChat({
        baseUrl: candidate.baseUrl,
        apiKey: candidate.apiKey,
        upstreamModel: candidate.upstreamModel,
        body: args.body,
        outputCap: reserve.maxOutputTokens,
        timeoutMs: candidate.timeoutMs,
        safeNoChargeStatuses: candidate.safeNoChargeStatuses,
      })
    } catch (error) {
      console.error('provider adapter threw unexpectedly', { requestId, providerId: candidate.providerId, error })
      await markAmbiguousBestEffort(db, requestId, 'PROVIDER_ADAPTER_RECONCILE_REQUIRED')
      return internalFailure(requestId, 'Gateway cannot confirm the upstream result')
    }

    if ('retryClass' in result) {
      lastFailure = result
      const attemptUpdateError = await auditWriteError(() =>
        db
          .from('provider_attempts')
          .update({
            status: result.retryClass === 'safe' ? 'safe_failed' : 'ambiguous_failed',
            error_code: result.code,
            completed_at: new Date().toISOString(),
          })
          .eq('id', attempt.id)
      )

      if (attemptUpdateError) {
        if (result.retryClass === 'safe') {
          await releaseKnownSafeFailure(db, requestId, 'PROVIDER_FAILURE_AUDIT_WRITE_FAILED')
        } else {
          await markAmbiguousBestEffort(db, requestId, 'PROVIDER_FAILURE_AUDIT_WRITE_FAILED')
        }
        return internalFailure(requestId, 'Gateway không thể ghi nhận kết quả upstream')
      }

      if (result.retryClass === 'safe') continue

      await markAmbiguousBestEffort(db, requestId, result.code)
      return Response.json(
        {
          error: {
            message: 'Upstream chưa phản hồi chắc chắn. Request không được tự gửi sang nguồn khác để tránh xử lý trùng.',
            type: 'upstream_error',
            code: 'upstream_error',
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
      const attemptUpdateError = await auditWriteError(() =>
        db
          .from('provider_attempts')
          .update({
            status: 'succeeded',
            provider_request_id: result.providerRequestId ?? null,
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
            completed_at: new Date().toISOString(),
          })
          .eq('id', attempt.id)
      )

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
      return Response.json(payload, { status: 200, headers: { 'x-request-id': requestId, 'x-apivn-latency-ms': String(Date.now() - startedAtMs), 'x-apivn-cost-micros': String(retailCost) } })
    }

    const streamingAttemptError = await auditWriteError(() =>
      db
        .from('provider_attempts')
        .update({ status: 'streaming', provider_request_id: result.providerRequestId ?? null })
        .eq('id', attempt.id)
    )
    const streamingRequestError = await auditWriteError(() =>
      db
        .from('api_requests')
        .update({ status: 'streaming', provider_id: candidate.providerId, provider_request_id: result.providerRequestId ?? null })
        .eq('id', requestId)
    )
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
        const attemptFailureAuditError = await auditWriteError(() =>
          db
            .from('provider_attempts')
            .update({
              status: 'ambiguous_failed',
              error_code: 'STREAM_USAGE_RECONCILE_REQUIRED',
              completed_at: new Date().toISOString(),
            })
            .eq('id', attempt.id)
        )
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
  const finalError = lastFailure?.code === 'UPSTREAM_TIMEOUT'
    ? { status: 504, message: 'Upstream phản hồi quá thời gian cho phép', code: 'upstream_timeout' }
    : lastFailure?.httpStatus === 429
      ? { status: 429, message: 'Upstream đang giới hạn tốc độ request', code: 'rate_limited' }
      : { status: 503, message: 'Hiện chưa có nguồn khả dụng cho model này', code: 'model_unavailable' }
  return Response.json(
    { error: { message: finalError.message, type: 'upstream_error', code: finalError.code } },
    { status: finalError.status, headers: { 'x-request-id': requestId } }
  )
}
