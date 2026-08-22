const PAYOS_API_BASE = 'https://api-merchant.payos.vn'
const PAYOS_REQUEST_TIMEOUT_MS = 15_000

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
    desc?: string
  }
  signature?: string
}

type PayOSPaymentLinkData = Record<string, unknown> & {
  checkoutUrl?: string
  paymentLinkId?: string
  qrCode?: string
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

function hexToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null

  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
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

function serializeSortedObject(data: Record<string, unknown>) {
  return Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => `${key}=${normalizeSignatureValue(data[key])}`)
    .join('&')
}

async function signSortedObject(checksumKey: string, data: Record<string, unknown>) {
  return hmacSha256Hex(checksumKey, serializeSortedObject(data))
}

export async function verifyHmacSha256Hex(secret: string, value: string, signature: string) {
  const signatureBytes = hexToBytes(signature)
  if (!signatureBytes) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(value),
  )
}

async function verifySortedObjectSignature(
  checksumKey: string,
  data: Record<string, unknown>,
  signature: string,
) {
  return verifyHmacSha256Hex(checksumKey, serializeSortedObject(data), signature)
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
    signal: AbortSignal.timeout(PAYOS_REQUEST_TIMEOUT_MS),
  })

  const body = (await response.json().catch(() => null)) as
    | { code?: string; desc?: string; data?: PayOSPaymentLinkData; signature?: string }
    | null

  if (!response.ok || body?.code !== '00' || !body.data?.checkoutUrl) {
    throw new Error(`PAYOS_CREATE_FAILED:${body?.code ?? response.status}:${body?.desc ?? 'unknown'}`)
  }

  if (
    !body.signature ||
    !(await verifySortedObjectSignature(credentials.checksumKey, body.data, body.signature))
  ) {
    throw new Error('PAYOS_CREATE_FAILED:INVALID_RESPONSE_SIGNATURE')
  }

  return body.data
}

export async function verifyPayOSWebhook(payload: PayOSWebhookPayload) {
  const credentials = getCredentials()
  if (!credentials || !payload.signature || !payload.data) return false

  return verifySortedObjectSignature(credentials.checksumKey, payload.data, payload.signature)
}
