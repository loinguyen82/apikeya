import { createClient } from '@supabase/supabase-js'

export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const secretKey =
    process.env.SUPABASE_ADMIN_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
