import { describe, expect, it } from 'vitest'
import { classifyRetry } from '@aiapi/core'

describe('retry policy', () => {
  it('never retries after stream start', () => {
    expect(classifyRetry({ responseStarted: true, streamStarted: true, kind: 'network' })).toBe('unsafe')
  })
  it('treats timeout as ambiguous', () => {
    expect(classifyRetry({ responseStarted: false, streamStarted: false, kind: 'timeout' })).toBe('unsafe')
  })
  it('allows explicit no-charge HTTP failures', () => {
    expect(
      classifyRetry({ responseStarted: false, streamStarted: false, kind: 'http', adapterDeclaredNoCharge: true })
    ).toBe('safe')
  })
})
