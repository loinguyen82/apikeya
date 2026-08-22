import type { MiddlewareHandler } from 'hono'
import { sha256Hex } from '../utils/crypto.js'
import { adminDb } from '../repositories/supabase.js'
import type { Env } from '../env.js'

type Variables = {
  userId: string
  apiKeyId: string
}

export function isSupportedApiKey(value: string): boolean {
  return value.startsWith('sk-') || value.startsWith('ak_live_')
}

export function extractBearerApiKey(value: string | undefined): string | null {
  if (!value) return null
  const match = value.match(/^Bearer\s+(.+)$/i)
  const key = match?.[1]?.trim()
  return key || null
}

export async function updateLastUsedBestEffort(
  operation: () => PromiseLike<{ error: { code?: string } | null }>,
): Promise<void> {
  try {
    const { error } = await operation()
    if (error) console.error('API key last_used_at update failed', { code: error.code })
  } catch (error) {
    console.error('API key last_used_at update failed', { error })
  }
}

export const requireApiKey: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const auth = c.req.header('authorization')
  const rawHeaderKey = c.req.header('x-api-key')
  const headerKey = rawHeaderKey?.trim() || null
  const bearerKey = extractBearerApiKey(auth)

  if (headerKey && bearerKey && headerKey !== bearerKey) {
    return c.json({ error: { message: 'API key không nhất quán', type: 'authentication_error' } }, 401)
  }
  const plaintext = headerKey || bearerKey
  if (!plaintext) {
    return c.json({ error: { message: 'Thiếu API key', type: 'authentication_error' } }, 401)
  }
  if (!isSupportedApiKey(plaintext)) {
    return c.json({ error: { message: 'API key không hợp lệ', type: 'authentication_error' } }, 401)
  }

  const secretHash = await sha256Hex(plaintext)
  const db = adminDb(c.env)
  const { data, error } = await db
    .from('api_keys')
    .select('id,user_id,status,expires_at')
    .eq('secret_hash', secretHash)
    .maybeSingle()

  if (error) {
    console.error('API key lookup failed', { code: error.code })
    return c.json({ error: { message: 'Dịch vụ xác thực tạm thời không khả dụng', type: 'server_error' } }, 503)
  }
  if (!data || data.status !== 'active') {
    return c.json({ error: { message: 'API key không hợp lệ hoặc đã khóa', type: 'authentication_error' } }, 401)
  }
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
    return c.json({ error: { message: 'API key đã hết hạn', type: 'authentication_error' } }, 401)
  }

  c.set('userId', data.user_id)
  c.set('apiKeyId', data.id)
  await next()

  const lastUsedUpdate = updateLastUsedBestEffort(() =>
    db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  )

  let executionCtx: { waitUntil(promise: Promise<any>): void } | undefined
  try {
    executionCtx = c.executionCtx
  } catch {
    executionCtx = undefined
  }
  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(lastUsedUpdate)
  } else {
    await lastUsedUpdate
  }
}
