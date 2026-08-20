import { describe, expect, it } from 'vitest'
import { resolveModelAlias } from '../src/application/catalog.js'

describe('model aliases', () => {
  it('resolves common VietAPI-style aliases', () => {
    expect(resolveModelAlias('gpt')).toBe('gpt-5.6-luna')
    expect(resolveModelAlias('SONNET')).toBe('claude-sonnet-5')
    expect(resolveModelAlias('kimi')).toBe('kimi-k2.6')
  })

  it('leaves canonical and unknown model ids unchanged', () => {
    expect(resolveModelAlias('gpt-5.6-sol')).toBe('gpt-5.6-sol')
    expect(resolveModelAlias('unknown-model')).toBe('unknown-model')
  })
})