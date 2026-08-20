import { describe, expect, it } from 'vitest'
import { isSupportedApiKey } from '../src/middleware/api-key.js'

describe('API key prefixes', () => {
  it('accepts new sk keys and legacy ak_live keys', () => {
    expect(isSupportedApiKey('sk-test-key')).toBe(true)
    expect(isSupportedApiKey('ak_live_test_key')).toBe(true)
  })

  it('rejects unrelated credential formats', () => {
    expect(isSupportedApiKey('Bearer sk-test-key')).toBe(false)
    expect(isSupportedApiKey('pk-test-key')).toBe(false)
  })
})
