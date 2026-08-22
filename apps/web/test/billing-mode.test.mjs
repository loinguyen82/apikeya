import assert from 'node:assert/strict'
import test from 'node:test'
import { isLiveBillingEnabled } from '../src/lib/billing-mode.ts'

test('keeps billing disabled unless live mode is explicitly enabled', () => {
  const originalMode = process.env.BILLING_MODE

  try {
    delete process.env.BILLING_MODE
    assert.equal(isLiveBillingEnabled(), false)

    process.env.BILLING_MODE = 'mock'
    assert.equal(isLiveBillingEnabled(), false)

    process.env.BILLING_MODE = 'disabled'
    assert.equal(isLiveBillingEnabled(), false)

    process.env.BILLING_MODE = 'LIVE'
    assert.equal(isLiveBillingEnabled(), false)

    process.env.BILLING_MODE = 'live'
    assert.equal(isLiveBillingEnabled(), true)
  } finally {
    if (originalMode === undefined) delete process.env.BILLING_MODE
    else process.env.BILLING_MODE = originalMode
  }
})
