import type { MiddlewareHandler } from 'hono'
import { sha256Hex } from '../utils/crypto.js'
import { adminDb } from '../repositories/supabase.js'
import type { Env } from '../env.js'

type Variables = {
  userId: string
  apiKeyId: string
}

export const requireApiKey: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const auth = c.req.header('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: { message: 'Thiếu API key', type: 'authentication_error' } }, 401)
  }
  const plaintext = auth.slice('Bearer '.length).trim()
  if (!plaintext.startsWith('ak_live_')) {
    return c.json({ error: { message: 'API key không hợp lệ', type: 'authentication_error' } }, 401)
  }
  const secretHash = await sha256Hex(plaintext)
  const db = adminDb(c.env)
  const { data, error } = await db
    .from('api_keys')
    .select('id,user_id,status,expires_at')
    .eq('secret_hash', secretHash)
    .maybeSingle()

  if (error || !data || data.status !== 'active') {
    return c.json({ error: { message: 'API key không hợp lệ hoặc đã khóa', type: 'authentication_error' } }, 401)
  }
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
    return c.json({ error: { message: 'API key đã hết hạn', type: 'authentication_error' } }, 401)
  }

  c.set('userId', data.user_id)
  c.set('apiKeyId', data.id)
  await next()

  let executionCtx: { waitUntil(promise: Promise<any>): void } | undefined
  try {
    executionCtx = c.executionCtx
  } catch {
    executionCtx = undefined
  }
  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(
      Promise.resolve(
        db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
      ).then(() => undefined)
    )
  }
}
