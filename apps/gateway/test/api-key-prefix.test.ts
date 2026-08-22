import { describe, expect, it, vi } from 'vitest'
import { extractBearerApiKey, isSupportedApiKey, updateLastUsedBestEffort } from '../src/middleware/api-key.js'

describe('API key prefixes', () => {
  it('accepts APIVN keys and legacy credentials during migration', () => {
    expect(isSupportedApiKey('sk-apivn-test-key')).toBe(true)
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

  it('does not fail an authenticated request when the last-used audit rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      updateLastUsedBestEffort(() => Promise.reject(new Error('database unavailable'))),
    ).resolves.toBeUndefined()
  })
})
