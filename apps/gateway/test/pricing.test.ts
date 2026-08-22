import { describe, expect, it } from 'vitest'
import { chargeForUsage, computeReserveMicros, estimateInputTokens } from '@aiapi/core'

const price = { mode: 'flat_total' as const, flatMicrosPerMToken: 2_500_000n } // 2,500 VND/M

describe('pricing', () => {
  it('uses integer micros and rounds up', () => {
    expect(chargeForUsage(price, 1000, 1000)).toBe(5000n)
  })
  it('reserve is greater than exact charge for typical body', () => {
    const body = {
      model: 'x',
      messages: [{ role: 'user' as const, content: 'hello'.repeat(100) }],
      max_tokens: 512,
    }
    const r = computeReserveMicros(body, price, 8192)
    expect(r.reserveMicros).toBeGreaterThan(chargeForUsage(price, 100, 512))
  })

  it('includes forwarded tool schemas in the input reservation', () => {
    const baseline = estimateInputTokens({
      model: 'x',
      messages: [{ role: 'user', content: 'hello' }],
    })
    const withLargeTool = estimateInputTokens({
      model: 'x',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{
        type: 'function',
        function: {
          name: 'lookup',
          description: 'x'.repeat(10_000),
          parameters: { type: 'object', properties: {} },
        },
      }],
    })

    expect(withLargeTool).toBeGreaterThan(baseline + 4_000)
  })
})
