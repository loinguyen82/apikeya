export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function generateApiKey(): { plaintext: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  const plaintext = `sk-apivn-${token}`
  return { plaintext, prefix: plaintext.slice(0, 12) }
}
