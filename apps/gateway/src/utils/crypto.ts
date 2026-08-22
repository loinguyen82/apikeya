export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyHmacSha256Hex(secret: string, value: string, candidateHex: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(candidateHex)) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signature = new Uint8Array(candidateHex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)))
  return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(value))
}

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256Hex(left), sha256Hex(right)])
  let difference = 0
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index)
  }
  return difference === 0
}

export function createApiKey(): { plaintext: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const token = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const plaintext = `ak_live_${token}`
  return { plaintext, prefix: plaintext.slice(0, 14) }
}
