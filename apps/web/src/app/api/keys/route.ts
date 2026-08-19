import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(req: NextRequest) {
  const userClient = await createServerSupabase()
  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let name = 'API Key'
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      if (body.name) name = body.name.trim()
    } else if (contentType.includes('form')) {
      const form = await req.formData()
      const n = form.get('name')
      if (n) name = String(n).trim()
    }
  } catch {
    // default name
  }

  const admin = createAdminSupabase()
  const { plaintext, prefix } = generateKey()
  const hash = await sha256Hex(plaintext)

  const { data, error } = await admin
    .from('api_keys')
    .insert({
      user_id: user.id,
      name,
      prefix,
      secret_hash: hash,
      status: 'active',
    })
    .select('id,name,prefix,created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    key: data,
    plaintext,
  })
}

export async function DELETE(req: NextRequest) {
  const userClient = await createServerSupabase()
  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await req.json().catch(() => ({}))
  if (!id) {
    return NextResponse.json({ error: 'Missing key id' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('api_keys')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
