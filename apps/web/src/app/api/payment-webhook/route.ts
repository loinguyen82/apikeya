import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import {
  isPayOSConfigured,
  PayOSWebhookPayload,
  verifyHmacSha256Hex,
  verifyPayOSWebhook,
} from '@/lib/payos'
import { isLiveBillingEnabled } from '@/lib/billing-mode'

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024

async function readBoundedBody(req: NextRequest): Promise<string | null> {
  const declaredLength = req.headers.get('content-length')
  if (declaredLength) {
    const length = Number(declaredLength)
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_WEBHOOK_BODY_BYTES) {
      return null
    }
  }

  if (!req.body) return ''

  const reader = req.body.getReader()
  const decoder = new TextDecoder()
  let rawBody = ''
  let receivedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      receivedBytes += value.byteLength
      if (receivedBytes > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel('webhook_body_too_large')
        return null
      }
      rawBody += decoder.decode(value, { stream: true })
    }

    return rawBody + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

async function handlePayOSWebhook(payload: PayOSWebhookPayload) {
  const valid = await verifyPayOSWebhook(payload)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_payos_signature' }, { status: 401 })
  }
  if (!isLiveBillingEnabled()) {
    return NextResponse.json({ error: 'billing_mock_only' }, { status: 503 })
  }

  const payment = payload.data
  if (payload.code !== '00' || !payload.success || !payment || payment.code !== '00') {
    return NextResponse.json({ ok: true, message: 'Skipped non-success payOS webhook' })
  }

  const orderCode = Number(payment.orderCode)
  const amount = Number(payment.amount)
  const reference = typeof payment.reference === 'string' ? payment.reference.trim() : ''
  const paymentLinkId = typeof payment.paymentLinkId === 'string' ? payment.paymentLinkId.trim() : ''
  if (
    !Number.isSafeInteger(orderCode) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    payment.currency !== 'VND' ||
    !reference ||
    !paymentLinkId
  ) {
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
    console.error(JSON.stringify({ message: 'payOS topup lookup failed', orderCode, code: lookupError.code }))
    return NextResponse.json({ error: 'topup_lookup_failed' }, { status: 500 })
  }

  // payOS calls the webhook with signed sample data while confirming the URL.
  // Unknown order codes must return 2xx so webhook registration can succeed.
  if (!topup) {
    return NextResponse.json({ ok: true, message: 'Unknown payOS order ignored' })
  }

  if (Number(topup.payable_vnd) !== amount) {
    console.error(JSON.stringify({ message: 'payOS amount mismatch', orderCode, topupId: topup.id }))
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
    console.error(JSON.stringify({ message: 'payOS topup apply failed', orderCode, topupId: topup.id, code: error.code }))
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
  const signatureHex = signature?.startsWith('sha256=') ? signature.slice('sha256='.length) : ''

  if (!secret || !signatureHex || !(await verifyHmacSha256Hex(secret, rawBody, signatureHex))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isLiveBillingEnabled() || !isPayOSConfigured()) {
    return NextResponse.json({ error: 'billing_mock_only' }, { status: 503 })
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
  const rawBody = await readBoundedBody(req)
  if (rawBody === null) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  }

  if (isPayOSConfigured()) {
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
