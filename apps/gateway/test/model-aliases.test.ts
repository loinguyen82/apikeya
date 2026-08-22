import { describe, expect, it } from 'vitest'
import { resolveModelAlias } from '../src/application/catalog.js'

describe('model aliases', () => {
  it('resolves common VietAPI-style aliases', () => {
    expect(resolveModelAlias('gpt')).toBe('gpt-5.6-luna')
    expect(resolveModelAlias('SONNET')).toBe('claude-sonnet-5')
    expect(resolveModelAlias('opus')).toBe('claude-opus-5')
    expect(resolveModelAlias('kimi')).toBe('kimi-k2.6')
    expect(resolveModelAlias('gemini')).toBe('gemini-3.1-pro-preview')
    expect(resolveModelAlias('grok')).toBe('grok-4.6')
    expect(resolveModelAlias('qwen')).toBe('qwen3.7-plus')
  })

  it('leaves canonical and unknown model ids unchanged', () => {
    expect(resolveModelAlias('gpt-5.6-sol')).toBe('gpt-5.6-sol')
    expect(resolveModelAlias('unknown-model')).toBe('unknown-model')
  })
})
