import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { bankPollerSecret, hmacSha256Hex, safeEqual } from '@/lib/bank-poller-auth'

const PAYMENT_CODE_PATTERN = /APV[A-Z0-9]{8,12}/i
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

interface BankEventPayload {
  bank?: string
  external_id?: string
  amount_vnd?: number
  description?: string
  occurred_at?: string
  raw?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  const secret = bankPollerSecret()
  const timestamp = req.headers.get('x-bank-timestamp') ?? ''
  const signature = req.headers.get('x-bank-signature') ?? ''
  const body = await req.text()

  if (!secret || !timestamp || !signature) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const timestampMs = Number(timestamp)
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    return NextResponse.json({ error: 'stale_request' }, { status: 401 })
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${body}`)
  if (!safeEqual(signature, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: BankEventPayload
  try {
    payload = JSON.parse(body) as BankEventPayload
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const bank = payload.bank?.trim().toLowerCase()
  const externalId = payload.external_id?.trim()
  const amountVnd = Number(payload.amount_vnd)
  const description = payload.description?.trim() ?? ''
  const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : null

  if (bank !== 'mb') {
    return NextResponse.json({ error: 'unsupported_bank' }, { status: 400 })
  }
  if (!externalId || externalId.length > 160) {
    return NextResponse.json({ error: 'invalid_external_id' }, { status: 400 })
  }
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: 'invalid_occurred_at' }, { status: 400 })
  }

  const paymentCode = description.toUpperCase().match(PAYMENT_CODE_PATTERN)?.[0] ?? null
  const admin = createAdminSupabase()
  const { data, error } = await admin.rpc('ingest_bank_transaction', {
    p_bank: bank,
    p_external_id: externalId,
    p_amount_vnd: amountVnd,
    p_description: description,
    p_occurred_at: occurredAt.toISOString(),
    p_payment_code: paymentCode,
    p_raw: payload.raw ?? {},
  })

  if (error) {
    console.error('bank transaction reconciliation failed', {
      code: error.code,
      message: error.message,
      externalId,
    })
    return NextResponse.json({ error: 'reconciliation_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, result: data })
}
