import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeLocalHexaInput } from './local-hexa.js'

const compatibleModel = {
  id: 'catalog-configured-model',
  displayName: 'Catalog configured model',
  contextWindowTokens: 1_000,
  tokenizerFamily: 'openai_o200k_compatible',
} as const

afterEach(() => vi.unstubAllGlobals())

describe('local Hexa analyzer', () => {
  it('counts catalog-mapped text without making a network request', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('Hexa must not call fetch')
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await analyzeLocalHexaInput(compatibleModel, { type: 'text', text: 'Hello world' })

    expect(result.count.tokens).toBe(2)
    expect(result.count.accuracy).toBe('compatible_tokenizer')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps conversation, tool, and cumulative calculations local', async () => {
    const result = await analyzeLocalHexaInput(compatibleModel, {
      type: 'conversation',
      system: 'Be concise.',
      tools: [{ type: 'function', function: { name: 'weather', parameters: { type: 'object' } } }],
      messages: [
        { role: 'user', content: 'What is the weather?' },
        { role: 'assistant', content: 'I can check.' },
        { role: 'user', content: 'Please do.' },
      ],
    })

    expect(result.conversation?.breakdown.toolTokens).toBeGreaterThan(0)
    expect(result.conversation?.growth).toHaveLength(2)
    expect(result.conversation?.growth.at(-1)?.inputTokens).toBe(result.conversation?.currentContextTokens)
    expect(result.conversation?.cumulativeInputTokens).toBeGreaterThan(result.conversation?.currentContextTokens ?? 0)
    expect(result.conversation?.reReadContextTokens).toBeGreaterThan(0)
  })

  it('labels an unmapped catalog model as a local estimate', async () => {
    const result = await analyzeLocalHexaInput(
      { id: 'unmapped-model', displayName: 'Unmapped', contextWindowTokens: null, tokenizerFamily: null },
      { type: 'text', text: 'Xin chao' },
    )

    expect(result.count.accuracy).toBe('estimated')
    expect(result.count.tokens).toBeGreaterThan(0)
  })
})
