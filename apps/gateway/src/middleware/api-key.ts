import type { MiddlewareHandler } from 'hono'
import { sha256Hex } from '../utils/crypto.js'
import { adminDb } from '../repositories/supabase.js'
import type { Env } from '../env.js'

type Variables = {
  userId: string
  apiKeyId: string
}

export function isSupportedApiKey(value: string): boolean {
  return value.startsWith('sk-apivn-') || value.startsWith('sk-') || value.startsWith('ak_live_')
}

function authError(c: any, message: string, code: string, status = 401) {
  return c.json({ error: { message, type: 'authentication_error', code } }, status)
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
    return authError(c, 'API key không nhất quán', 'conflicting_api_key')
  }
  const plaintext = headerKey || bearerKey
  if (!plaintext) {
    return authError(c, 'Thiếu API key', 'missing_api_key')
  }
  if (!isSupportedApiKey(plaintext)) {
    return authError(c, 'API key không hợp lệ', 'invalid_api_key')
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
    return c.json({ error: { message: 'Dịch vụ xác thực tạm thời không khả dụng', type: 'server_error', code: 'authentication_unavailable' } }, 503)
  }
  if (!data) {
    return authError(c, 'API key không hợp lệ', 'invalid_api_key')
  }
  if (data.status !== 'active') {
    return authError(c, 'API key đã bị thu hồi', 'api_key_revoked')
  }
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
    return authError(c, 'API key đã hết hạn', 'api_key_expired')
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
