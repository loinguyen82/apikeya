import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const userClient = await createServerSupabase()
  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await req.formData()
  const id = String(form.get('id') || '')
  if (!id) return NextResponse.json({ error: 'invalid_key_id' }, { status: 400 })

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('api_keys')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'key_revoke_failed' }, { status: 500 })
  return NextResponse.redirect(new URL('/dashboard/api-keys', req.url), 303)
}
