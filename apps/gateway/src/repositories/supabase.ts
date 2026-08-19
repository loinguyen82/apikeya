import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../env.js'

export function adminDb(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function rpcOrThrow<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  if (data == null) throw new Error('RPC returned no data')
  return data
}
