import { describe, expect, it } from 'vitest'
import { normalizeProviderUsage, sseEventHasGeneratedOutput } from '../src/providers/usage.js'

describe('provider usage normalization', () => {
  it('keeps OpenAI-compatible cache and reasoning fields distinct', () => {
    expect(normalizeProviderUsage({
      usage: {
        prompt_tokens: 120,
        completion_tokens: 18,
        total_tokens: 138,
        prompt_tokens_details: { cached_tokens: 96 },
        completion_tokens_details: { reasoning_tokens: 7 },
      },
    })).toEqual({
      inputTokens: 120,
      outputTokens: 18,
      cachedInputTokens: 96,
      cacheCreationInputTokens: null,
      reasoningTokens: 7,
      totalTokens: 138,
      providerReported: true,
    })
  })

  it('preserves explicitly reported cache creation separately from cache reads', () => {
    expect(normalizeProviderUsage({
      usage: {
        input_tokens: 54,
        output_tokens: 12,
        cache_hit_input_tokens: 31,
        cache_creation_input_tokens: 20,
      },
    })).toMatchObject({
      inputTokens: 54,
      outputTokens: 12,
      cachedInputTokens: 31,
      cacheCreationInputTokens: 20,
      totalTokens: null,
    })
  })

  it('recognizes generated reasoning and text deltas for first-token timing', () => {
    expect(sseEventHasGeneratedOutput({ choices: [{ delta: { content: 'Hi' } }] })).toBe(true)
    expect(sseEventHasGeneratedOutput({ choices: [{ delta: { reasoning_content: 'Think' } }] })).toBe(true)
    expect(sseEventHasGeneratedOutput({ choices: [{ delta: { tool_calls: [{ function: { name: 'weather' } }] } }] })).toBe(true)
    expect(sseEventHasGeneratedOutput({ choices: [{ delta: { role: 'assistant' } }] })).toBe(false)
    expect(sseEventHasGeneratedOutput({ choices: [{ delta: { tool_calls: [{ index: 0, function: {} }] } }] })).toBe(false)
    expect(sseEventHasGeneratedOutput({ choices: [{ delta: { function_call: {} } }] })).toBe(false)
  })
})
