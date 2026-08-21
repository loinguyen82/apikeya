const PAYOS_API_BASE = 'https://api-merchant.payos.vn'

type PayOSCredentials = {
  clientId: string
  apiKey: string
  checksumKey: string
}

export type PayOSWebhookPayload = {
  code?: string
  desc?: string
  success?: boolean
  data?: Record<string, unknown> & {
    orderCode?: number
    amount?: number
    description?: string
    reference?: string
    currency?: string
    paymentLinkId?: string
    code?: string
  }
  signature?: string
}

function getCredentials(): PayOSCredentials | null {
  const clientId = process.env.PAYOS_CLIENT_ID
  const apiKey = process.env.PAYOS_API_KEY
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY

  if (!clientId || !apiKey || !checksumKey) return null
  return { clientId, apiKey, checksumKey }
}

export function isPayOSConfigured() {
  return getCredentials() !== null
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return toHex(new Uint8Array(digest))
}

function normalizeSignatureValue(value: unknown): string {
  if (value === null || value === undefined || value === 'null' || value === 'undefined') return ''
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        return Object.keys(item as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (item as Record<string, unknown>)[key]
            return acc
          }, {})
      }),
    )
  }
  return String(value)
}

async function signSortedObject(checksumKey: string, data: Record<string, unknown>) {
  const serialized = Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => `${key}=${normalizeSignatureValue(data[key])}`)
    .join('&')

  return hmacSha256Hex(checksumKey, serialized)
}

function safeSignatureEqual(left: string, right: string) {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

export function createPayOSOrderCode() {
  const seconds = Math.floor(Date.now() / 1000)
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return seconds * 1_000_000 + random
}

export async function createPayOSPaymentLink(input: {
  orderCode: number
  amount: number
  description: string
  returnUrl: string
  cancelUrl: string
  expiredAt: number
}) {
  const credentials = getCredentials()
  if (!credentials) throw new Error('PAYOS_NOT_CONFIGURED')

  const signatureData = {
    amount: input.amount,
    cancelUrl: input.cancelUrl,
    description: input.description,
    orderCode: input.orderCode,
    returnUrl: input.returnUrl,
  }
  const signature = await signSortedObject(credentials.checksumKey, signatureData)

  const response = await fetch(`${PAYOS_API_BASE}/v2/payment-requests`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-id': credentials.clientId,
      'x-api-key': credentials.apiKey,
    },
    body: JSON.stringify({
      ...signatureData,
      expiredAt: input.expiredAt,
      signature,
    }),
  })

  const body = (await response.json().catch(() => null)) as
    | { code?: string; desc?: string; data?: { checkoutUrl?: string; paymentLinkId?: string; qrCode?: string } }
    | null

  if (!response.ok || body?.code !== '00' || !body.data?.checkoutUrl) {
    throw new Error(`PAYOS_CREATE_FAILED:${body?.code ?? response.status}:${body?.desc ?? 'unknown'}`)
  }

  return body.data
}

export async function verifyPayOSWebhook(payload: PayOSWebhookPayload) {
  const credentials = getCredentials()
  if (!credentials || !payload.signature || !payload.data) return false

  const expected = await signSortedObject(credentials.checksumKey, payload.data)
  return safeSignatureEqual(expected, payload.signature)
}
