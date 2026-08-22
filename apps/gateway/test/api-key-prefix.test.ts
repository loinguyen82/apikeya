import { describe, expect, it } from 'vitest'
import { extractBearerApiKey, isSupportedApiKey } from '../src/middleware/api-key.js'

describe('API key prefixes', () => {
  it('accepts new sk keys and legacy ak_live keys', () => {
    expect(isSupportedApiKey('sk-test-key')).toBe(true)
    expect(isSupportedApiKey('ak_live_test_key')).toBe(true)
  })

  it('rejects unrelated credential formats', () => {
    expect(isSupportedApiKey('Bearer sk-test-key')).toBe(false)
    expect(isSupportedApiKey('pk-test-key')).toBe(false)
  })

  it('parses the Bearer scheme case-insensitively', () => {
    expect(extractBearerApiKey('Bearer sk-test-key')).toBe('sk-test-key')
    expect(extractBearerApiKey('bearer sk-test-key')).toBe('sk-test-key')
    expect(extractBearerApiKey('BEARER   sk-test-key  ')).toBe('sk-test-key')
  })

  it('does not treat other auth schemes as bearer credentials', () => {
    expect(extractBearerApiKey('Basic abc')).toBeNull()
    expect(extractBearerApiKey(undefined)).toBeNull()
  })
})
