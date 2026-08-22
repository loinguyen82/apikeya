import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {
  createPayOSPaymentLink,
  verifyHmacSha256Hex,
  verifyPayOSWebhook,
} from '../src/lib/payos.ts'

const checksumKey = 'test-checksum-key'
const originalFetch = globalThis.fetch

function normalizeSignatureValue(value) {
  if (value === null || value === undefined || value === 'null' || value === 'undefined') return ''
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        return Object.keys(item)
          .sort()
          .reduce((result, key) => {
            result[key] = item[key]
            return result
          }, {})
      }),
    )
  }
  return String(value)
}

function signObject(data) {
  const serialized = Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => `${key}=${normalizeSignatureValue(data[key])}`)
    .join('&')
  return createHmac('sha256', checksumKey).update(serialized).digest('hex')
}

test.beforeEach(() => {
  process.env.PAYOS_CLIENT_ID = 'test-client-id'
  process.env.PAYOS_API_KEY = 'test-api-key'
  process.env.PAYOS_CHECKSUM_KEY = checksumKey
})

test.after(() => {
  globalThis.fetch = originalFetch
})

test('verifies signed payOS webhooks and rejects tampering', async () => {
  const data = {
    orderCode: 1_234_567,
    amount: 1_000,
    description: 'APIVNTEST',
    reference: 'FT260822000001',
    transactionDateTime: '2026-08-22 10:00:00',
    currency: 'VND',
    paymentLinkId: 'payment-link-id',
    code: '00',
    desc: 'success',
  }
  const payload = { code: '00', desc: 'success', success: true, data, signature: signObject(data) }

  assert.equal(await verifyPayOSWebhook(payload), true)
  assert.equal(await verifyPayOSWebhook({ ...payload, data: { ...data, amount: 2_000 } }), false)
})

test('uses constant-time Web Crypto verification for legacy HMAC signatures', async () => {
  const body = '{"paid":true}'
  const signature = createHmac('sha256', checksumKey).update(body).digest('hex')
  const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`

  assert.equal(await verifyHmacSha256Hex(checksumKey, body, signature), true)
  assert.equal(await verifyHmacSha256Hex(checksumKey, body, tamperedSignature), false)
  assert.equal(await verifyHmacSha256Hex(checksumKey, body, 'not-hex'), false)
})

test('signs payment requests and verifies the signed payOS response', async () => {
  globalThis.fetch = async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body))
    const signatureData = {
      amount: requestBody.amount,
      cancelUrl: requestBody.cancelUrl,
      description: requestBody.description,
      orderCode: requestBody.orderCode,
      returnUrl: requestBody.returnUrl,
    }
    assert.equal(requestBody.signature, signObject(signatureData))

    const data = {
      checkoutUrl: 'https://pay.payos.vn/web/test-link',
      paymentLinkId: 'test-link',
      qrCode: 'test-qr',
      orderCode: requestBody.orderCode,
      amount: requestBody.amount,
      status: 'PENDING',
    }
    return Response.json({ code: '00', desc: 'success', data, signature: signObject(data) })
  }

  const payment = await createPayOSPaymentLink({
    orderCode: 1_234_567,
    amount: 1_000,
    description: 'APIVNTEST',
    returnUrl: 'https://apivn.tech/dashboard/billing?payment=return',
    cancelUrl: 'https://apivn.tech/dashboard/billing?payment=cancelled',
    expiredAt: 1_787_370_000,
  })

  assert.equal(payment.checkoutUrl, 'https://pay.payos.vn/web/test-link')
})

test('rejects an unsigned or tampered payment response', async () => {
  globalThis.fetch = async () =>
    Response.json({
      code: '00',
      desc: 'success',
      data: { checkoutUrl: 'https://attacker.example/checkout' },
      signature: '0'.repeat(64),
    })

  await assert.rejects(
    createPayOSPaymentLink({
      orderCode: 1_234_567,
      amount: 1_000,
      description: 'APIVNTEST',
      returnUrl: 'https://apivn.tech/dashboard/billing?payment=return',
      cancelUrl: 'https://apivn.tech/dashboard/billing?payment=cancelled',
      expiredAt: 1_787_370_000,
    }),
    /INVALID_RESPONSE_SIGNATURE/,
  )
})
