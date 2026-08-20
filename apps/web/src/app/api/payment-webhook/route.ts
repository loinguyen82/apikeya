import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
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

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-webhook-signature')
  const secret = process.env.PAYMENT_WEBHOOK_SECRET
  const body = await req.text()
  const expected = secret ? `sha256=${await hmacSha256Hex(secret, body)}` : ''

  if (!secret || !signature || signature !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: {
    topup_id?: string
    external_id?: string
    paid?: boolean
  }
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!payload.paid || !payload.topup_id || !payload.external_id) {
    return NextResponse.json({ ok: true, message: 'Skipped non-paid or incomplete payload' })
  }

  const admin = createAdminSupabase()
  const { data, error } = await admin.rpc('apply_paid_topup', {
    p_topup_id: payload.topup_id,
    p_external_id: payload.external_id,
  })

  if (error) {
    return NextResponse.json({ error: 'topup_apply_failed' }, { status: 500 })
  }
  if (data?.status !== 'paid') {
    return NextResponse.json({ error: 'topup_not_paid', status: data?.status ?? 'unknown' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, topup_id: payload.topup_id, status: 'paid' })
}
