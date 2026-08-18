import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateKey(): { plaintext: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  const plaintext = `ak_live_${token}`
  return { plaintext, prefix: plaintext.slice(0, 14) }
}

export async function POST(req: Request) {
  const userClient = await createServerSupabase()
  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const { plaintext, prefix } = generateKey()
  const hash = await sha256Hex(plaintext)

  const { error } = await admin.from('api_keys').insert({
    user_id: user.id,
    name: 'Khóa API mặc định',
    prefix,
    secret_hash: hash,
    status: 'active',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.redirect(
    new URL(`/dashboard/api-keys?created=true&key=${encodeURIComponent(plaintext)}`, req.url),
    303
  )
}
