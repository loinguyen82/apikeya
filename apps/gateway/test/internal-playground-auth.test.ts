import { describe, expect, it } from 'vitest'
import { internalPlaygroundRoute } from '../src/routes/internal-playground.js'
import { hmacSha256Hex } from '../src/utils/crypto.js'

const baseEnv = {
  ENVIRONMENT: 'test',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  A6API_BASE_URL: '',
  A6API_KEY: '',
  NECO_BASE_URL: '',
  NECO_KEY: '',
  INTERNAL_ADMIN_TOKEN: 'internal-token',
  GATEWAY_USER_ASSERTION_SECRET: 'assertion-secret',
}

describe('internal playground authentication', () => {
  it('requires the internal token', async () => {
    const response = await internalPlaygroundRoute.request('/', { method: 'POST' }, baseEnv)
    expect(response.status).toBe(401)
  })

  it('fails closed when the dedicated assertion secret is missing', async () => {
    const response = await internalPlaygroundRoute.request(
      '/',
      {
        method: 'POST',
        headers: {
          'x-internal-token': baseEnv.INTERNAL_ADMIN_TOKEN,
          'x-user-id': 'user-1',
        },
      },
      { ...baseEnv, GATEWAY_USER_ASSERTION_SECRET: '' },
    )

    expect(response.status).toBe(503)
  })

  it('rejects an invalid user assertion before request execution', async () => {
    const response = await internalPlaygroundRoute.request(
      '/',
      {
        method: 'POST',
        headers: {
          'x-internal-token': baseEnv.INTERNAL_ADMIN_TOKEN,
          'x-user-id': 'user-1',
          'x-user-assertion': 'sha256=invalid',
        },
      },
      baseEnv,
    )

    expect(response.status).toBe(401)
  })

  it('accepts a correctly signed user context and proceeds to validation', async () => {
    const userId = 'user-1'
    const assertion = await hmacSha256Hex(baseEnv.GATEWAY_USER_ASSERTION_SECRET, userId)
    const response = await internalPlaygroundRoute.request(
      '/',
      {
        method: 'POST',
        headers: {
          'x-internal-token': baseEnv.INTERNAL_ADMIN_TOKEN,
          'x-user-id': userId,
          'x-user-assertion': `sha256=${assertion}`,
          'content-type': 'application/json',
        },
        body: '{}',
      },
      baseEnv,
    )

    expect(response.status).toBe(400)
  })
})
