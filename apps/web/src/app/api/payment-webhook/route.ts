import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { PayOSWebhookPayload, verifyPayOSWebhook } from '@/lib/payos'

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

async function handlePayOSWebhook(payload: PayOSWebhookPayload) {
  const valid = await verifyPayOSWebhook(payload)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_payos_signature' }, { status: 401 })
  }

  const payment = payload.data
  if (!payload.success || !payment || payment.code !== '00') {
    return NextResponse.json({ ok: true, message: 'Skipped non-success payOS webhook' })
  }

  const orderCode = Number(payment.orderCode)
  const amount = Number(payment.amount)
  if (!Number.isSafeInteger(orderCode) || !Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: 'invalid_payos_payload' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: topup, error: lookupError } = await admin
    .from('topups')
    .select('id,payable_vnd,status')
    .eq('payment_provider', 'payos')
    .eq('external_id', String(orderCode))
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: 'topup_lookup_failed' }, { status: 500 })
  }

  // payOS calls the webhook with signed sample data while confirming the URL.
  // Unknown order codes must return 2xx so webhook registration can succeed.
  if (!topup) {
    return NextResponse.json({ ok: true, message: 'Unknown payOS order ignored' })
  }

  if (Number(topup.payable_vnd) !== amount) {
    return NextResponse.json({ error: 'payment_amount_mismatch' }, { status: 409 })
  }

  if (topup.status === 'paid') {
    return NextResponse.json({ ok: true, topup_id: topup.id, status: 'paid', duplicate: true })
  }

  const { data, error } = await admin.rpc('apply_paid_topup', {
    p_topup_id: topup.id,
    p_external_id: String(orderCode),
  })

  if (error) {
    return NextResponse.json({ error: 'topup_apply_failed' }, { status: 500 })
  }
  if (data?.status !== 'paid') {
    return NextResponse.json({ error: 'topup_not_paid', status: data?.status ?? 'unknown' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, topup_id: topup.id, status: 'paid' })
}

async function handleLegacyWebhook(req: NextRequest, rawBody: string) {
  const signature = req.headers.get('x-webhook-signature')
  const secret = process.env.PAYMENT_WEBHOOK_SECRET
  const expected = secret ? `sha256=${await hmacSha256Hex(secret, rawBody)}` : ''

  if (!secret || !signature || signature !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: {
    topup_id?: string
    external_id?: string
    paid?: boolean
  }
  try {
    payload = JSON.parse(rawBody)
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

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (process.env.PAYOS_CHECKSUM_KEY) {
    let payload: PayOSWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }
    return handlePayOSWebhook(payload)
  }

  return handleLegacyWebhook(req, rawBody)
}
