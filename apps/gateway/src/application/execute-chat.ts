import type { ChatCompletionRequest, ProviderFailure } from '@aiapi/contracts'
import { chargeForUsage, computeReserveMicros, upstreamCostForUsage } from '@aiapi/core'
import type { Env } from '../env'
import { adminDb } from '../repositories/supabase'
import { loadRuntimeModel } from './catalog'
import { markAmbiguous, releaseRequest, reserveRequest, settleRequest } from './billing'
import { newId } from '../utils/id'
import { OpenAICompatibleAdapter } from '../providers/openai-compatible'

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
    await db.from('api_requests').update({ status: 'dispatching', provider_id: candidate.providerId }).eq('id', requestId)
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
      await markAmbiguous(db, requestId, 'ATTEMPT_AUDIT_WRITE_FAILED')
      return Response.json(
        {
          error: {
            message: 'Không thể ghi nhận lượt gọi upstream an toàn',
            type: 'server_error',
            request_id: requestId,
          },
        },
        { status: 500, headers: { 'x-request-id': requestId } }
      )
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
      await db
        .from('provider_attempts')
        .update({
          status: result.retryClass === 'safe' ? 'safe_failed' : 'ambiguous_failed',
          error_code: result.code,
          completed_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)

      if (result.retryClass === 'safe') continue

      await markAmbiguous(db, requestId, result.code)
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
      await db
        .from('provider_attempts')
        .update({
          status: 'succeeded',
          provider_request_id: result.providerRequestId ?? null,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          completed_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)

      await settleRequest(db, {
        requestId,
        retailCostMicros: retailCost,
        upstreamCostMicros: upstreamCost,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        providerId: candidate.providerId,
        providerRequestId: result.providerRequestId,
      })

      const payload = { ...result.payload, gateway_request_id: requestId }
      return Response.json(payload, { status: 200, headers: { 'x-request-id': requestId } })
    }

    await db
      .from('provider_attempts')
      .update({ status: 'streaming', provider_request_id: result.providerRequestId ?? null })
      .eq('id', attempt.id)
    await db
      .from('api_requests')
      .update({ status: 'streaming', provider_id: candidate.providerId, provider_request_id: result.providerRequestId ?? null })
      .eq('id', requestId)

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
        await db
          .from('provider_attempts')
          .update({
            status: 'succeeded',
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            completed_at: new Date().toISOString(),
          })
          .eq('id', attempt.id)

        await settleRequest(db, {
          requestId,
          retailCostMicros: retailCost,
          upstreamCostMicros: upstreamCost,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          providerId: candidate.providerId,
          providerRequestId: result.providerRequestId,
        })
      } catch (e) {
        await db
          .from('provider_attempts')
          .update({
            status: 'ambiguous_failed',
            error_code: 'STREAM_USAGE_RECONCILE_REQUIRED',
            completed_at: new Date().toISOString(),
          })
          .eq('id', attempt.id)
        await markAmbiguous(db, requestId, 'STREAM_USAGE_RECONCILE_REQUIRED')
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

  await releaseRequest(db, requestId, lastFailure?.code ?? 'NO_HEALTHY_PROVIDER')
  return Response.json(
    { error: { message: 'Hiện chưa có nguồn khả dụng cho model này', type: 'upstream_unavailable' } },
    { status: 503, headers: { 'x-request-id': requestId } }
  )
}
