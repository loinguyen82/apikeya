import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  loadRuntimeModel: vi.fn(),
  markAmbiguous: vi.fn(),
  releaseRequest: vi.fn(),
  reserveRequest: vi.fn(),
  settleRequest: vi.fn(),
  invokeChat: vi.fn(),
  newId: vi.fn(),
}))

vi.mock('../src/repositories/supabase.js', () => ({ adminDb: mocks.adminDb }))
vi.mock('../src/application/catalog.js', () => ({ loadRuntimeModel: mocks.loadRuntimeModel }))
vi.mock('../src/application/billing.js', () => ({
  markAmbiguous: mocks.markAmbiguous,
  releaseRequest: mocks.releaseRequest,
  reserveRequest: mocks.reserveRequest,
  settleRequest: mocks.settleRequest,
}))
vi.mock('../src/utils/id.js', () => ({ newId: mocks.newId }))
vi.mock('../src/providers/openai-compatible.js', () => ({
  OpenAICompatibleAdapter: class {
    invokeChat = mocks.invokeChat
  },
}))

import { executeChat } from '../src/application/execute-chat.js'

type DbOptions = {
  dispatchError?: unknown
  attemptInsertError?: unknown
  attemptUpdateError?: unknown
}

function makeDb(options: DbOptions = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'api_requests') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: options.dispatchError ?? null })),
          })),
        }
      }
      if (table === 'provider_attempts') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: options.attemptInsertError ? null : { id: 'attempt-1' },
                error: options.attemptInsertError ?? null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: options.attemptUpdateError ?? null })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

const runtimeModel = {
  id: 'retail-model',
  displayName: 'Retail model',
  description: '',
  tags: [],
  status: 'active',
  pricingMode: 'flat_total',
  retailFlatMicrosPerMToken: '1000000',
  retailInputMicrosPerMToken: null,
  retailOutputMicrosPerMToken: null,
  defaultMaxOutputTokens: 256,
  maxOutputTokens: 512,
  streamingEnabled: true,
  providers: [{
    providerId: 'provider-1',
    baseUrl: 'https://provider.example/v1',
    apiKey: 'provider-secret',
    upstreamModel: 'upstream-model',
    timeoutMs: 10_000,
    priority: 1,
    supportsStreamUsage: true,
    safeNoChargeStatuses: [401],
    upstreamInputMicrosPerMToken: '1000',
    upstreamOutputMicrosPerMToken: '1000',
  }],
} as const

const executeArgs = {
  env: {} as any,
  body: {
    model: 'retail-model',
    messages: [{ role: 'user' as const, content: 'hello' }],
    max_tokens: 9_999,
  },
  userId: 'user-1',
  apiKeyId: 'key-1',
  channel: 'api' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.newId.mockReturnValue('request-1')
  mocks.loadRuntimeModel.mockResolvedValue(runtimeModel)
  mocks.reserveRequest.mockResolvedValue({ id: 'request-1', status: 'reserved' })
  mocks.releaseRequest.mockResolvedValue({ id: 'request-1', status: 'released' })
  mocks.markAmbiguous.mockResolvedValue(undefined)
  mocks.invokeChat.mockResolvedValue({
    providerId: 'provider-1',
    code: 'UPSTREAM_HTTP_401',
    message: 'unauthorized',
    httpStatus: 401,
    retryClass: 'safe',
  })
})

describe('executeChat billing safety', () => {
  it('binds the provider call to the output cap used by the reservation', async () => {
    mocks.adminDb.mockReturnValue(makeDb())

    const response = await executeChat(executeArgs)

    expect(response.status).toBe(503)
    expect(mocks.invokeChat).toHaveBeenCalledWith(expect.objectContaining({ outputCap: 512 }))
    expect(mocks.reserveRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxOutputTokens: 512 }),
    )
  })

  it('releases the reservation when the dispatch audit fails before upstream invocation', async () => {
    const db = makeDb({ dispatchError: { message: 'database unavailable' } })
    mocks.adminDb.mockReturnValue(db)

    const response = await executeChat(executeArgs)

    expect(response.status).toBe(500)
    expect(mocks.invokeChat).not.toHaveBeenCalled()
    expect(mocks.releaseRequest).toHaveBeenCalledWith(db, 'request-1', 'DISPATCH_AUDIT_WRITE_FAILED')
    expect(mocks.markAmbiguous).not.toHaveBeenCalled()
  })

  it('releases the reservation when creating the provider attempt fails before dispatch', async () => {
    const db = makeDb({ attemptInsertError: { message: 'insert failed' } })
    mocks.adminDb.mockReturnValue(db)

    const response = await executeChat(executeArgs)

    expect(response.status).toBe(500)
    expect(mocks.invokeChat).not.toHaveBeenCalled()
    expect(mocks.releaseRequest).toHaveBeenCalledWith(db, 'request-1', 'ATTEMPT_AUDIT_WRITE_FAILED')
    expect(mocks.markAmbiguous).not.toHaveBeenCalled()
  })

  it('releases a declared no-charge failure even when its attempt audit cannot be updated', async () => {
    const db = makeDb({ attemptUpdateError: { message: 'update failed' } })
    mocks.adminDb.mockReturnValue(db)

    const response = await executeChat(executeArgs)

    expect(response.status).toBe(500)
    expect(mocks.releaseRequest).toHaveBeenCalledWith(db, 'request-1', 'PROVIDER_FAILURE_AUDIT_WRITE_FAILED')
    expect(mocks.markAmbiguous).not.toHaveBeenCalled()
  })
})
