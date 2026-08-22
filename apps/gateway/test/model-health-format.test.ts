import { describe, expect, it } from 'vitest'
import { formatModelHealthReport, type ModelSummary } from '../src/monitor/model-health.js'

function summary(input: {
  modelId: string
  status: ModelSummary['status']
  latencyMs: number
  httpStatus: number | null
  errorCode?: string | null
}): ModelSummary {
  return {
    modelId: input.modelId,
    status: input.status,
    latencyMs: input.latencyMs,
    providers: [
      {
        providerId: 'a6api',
        modelId: input.modelId,
        previousStatus: 'unknown',
        status: input.status,
        consecutiveFailures: input.status === 'live' ? 0 : 1,
        latencyMs: input.latencyMs,
        httpStatus: input.httpStatus,
        errorCode: input.errorCode ?? null,
        errorMessage: null,
      },
    ],
  }
}

describe('formatModelHealthReport', () => {
  it('matches the compact VietAPI-style Telegram report', () => {
    const text = formatModelHealthReport([
      summary({ modelId: 'gpt-5.6-sol', status: 'live', latencyMs: 1214, httpStatus: 200 }),
      summary({ modelId: 'claude-sonnet-5', status: 'degraded', latencyMs: 40001, httpStatus: null, errorCode: 'UPSTREAM_TIMEOUT' }),
      summary({ modelId: 'kimi-k2.6', status: 'dead', latencyMs: 327, httpStatus: 401, errorCode: 'UPSTREAM_HTTP_401' }),
    ])

    expect(text).toContain('🔎 APIVN model health check')
    expect(text).toContain('Base: https://api.apivn.tech/v1')
    expect(text).toContain('Tổng: 3 · OK: 1 · Chậm/chưa kết luận: 1 · Lỗi HTTP: 1')
    expect(text).toContain('✅ gpt-5.6-sol: OK · HTTP 200 · 1214ms')
    expect(text).toContain('🟡 claude-sonnet-5: CHẬM >40s · HTTP ERR · 40001ms')
    expect(text).toContain('❌ kimi-k2.6: LỖI · HTTP 401 · 327ms')
  })
})
