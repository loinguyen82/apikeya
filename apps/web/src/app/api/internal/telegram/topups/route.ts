import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { isLiveBillingEnabled } from '@/lib/billing-mode'
import {
  createPayOSOrderCode,
  createPayOSPaymentLink,
  isPayOSConfigured,
} from '@/lib/payos'

const MIN_TOPUP_VND = 1000
const TOPUP_STEP_VND = 1000
const TOPUP_TTL_MS = 30 * 60 * 1000

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function constantTimeEqual(left: string, right: string) {
  const [a, b] = await Promise.all([sha256Hex(left), sha256Hex(right)])
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifyUserAssertion(secret: string, userId: string, candidate: string) {
  if (!candidate.startsWith('sha256=')) return false
  const signatureHex = candidate.slice('sha256='.length)
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const bytes = new Uint8Array(signatureHex.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)))
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(userId))
}

function bonusFor(amount: number) {
  if (amount >= 1_000_000) return Math.floor(amount * 0.08)
  if (amount >= 500_000) return Math.floor(amount * 0.05)
  if (amount >= 200_000) return Math.floor(amount * 0.02)
  return 0
}

export async function POST(req: NextRequest) {
  const internalToken = req.headers.get('x-internal-token') ?? ''
  const expectedToken = process.env.GATEWAY_INTERNAL_TOKEN ?? ''
  const userId = req.headers.get('x-user-id') ?? ''
  const assertion = req.headers.get('x-user-assertion') ?? ''
  const assertionSecret = process.env.GATEWAY_USER_ASSERTION_SECRET ?? ''

  if (!expectedToken || !(await constantTimeEqual(internalToken, expectedToken))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!userId || !assertionSecret || !(await verifyUserAssertion(assertionSecret, userId, assertion))) {
    return NextResponse.json({ error: 'invalid_user_context' }, { status: 401 })
  }
  if (!isLiveBillingEnabled()) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
  }
  if (!isPayOSConfigured()) {
    return NextResponse.json({ error: 'PAYOS_NOT_CONFIGURED' }, { status: 503 })
  }

  const payload = await req.json().catch(() => null) as { amount?: unknown } | null
  const amount = Number(payload?.amount)
  if (!Number.isSafeInteger(amount) || amount < MIN_TOPUP_VND || amount % TOPUP_STEP_VND !== 0) {
    return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const now = new Date()

  await admin
    .from('topups')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('expires_at', now.toISOString())

  const { count: activePendingCount, error: pendingLookupError } = await admin
    .from('topups')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())

  if (pendingLookupError) {
    return NextResponse.json({ error: 'TOPUP_LOOKUP_FAILED' }, { status: 503 })
  }
  if ((activePendingCount ?? 0) > 0) {
    return NextResponse.json({ error: 'ACTIVE_TOPUP_EXISTS' }, { status: 409 })
  }

  const topupId = crypto.randomUUID()
  const orderCode = createPayOSOrderCode()
  const expiresAt = new Date(now.getTime() + TOPUP_TTL_MS)
  const bonus = bonusFor(amount)

  const { error: insertError } = await admin.from('topups').insert({
    id: topupId,
    user_id: userId,
    amount_micros: String(amount * 1000),
    bonus_micros: String(bonus * 1000),
    payable_vnd: amount,
    payment_provider: 'payos',
    external_id: String(orderCode),
    status: 'pending',
    expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'ACTIVE_TOPUP_EXISTS' }, { status: 409 })
    }
    return NextResponse.json({ error: 'TOPUP_CREATE_FAILED' }, { status: 500 })
  }

  const description = `APIVN${topupId.replace(/-/g, '').slice(0, 4).toUpperCase()}`
  const returnUrl = `https://apivn.tech/dashboard/billing?topup=${topupId}&payment=return&source=telegram`
  const cancelUrl = `https://apivn.tech/dashboard/billing?topup=${topupId}&payment=cancelled&source=telegram`

  try {
    const payment = await createPayOSPaymentLink({
      orderCode,
      amount,
      description,
      returnUrl,
      cancelUrl,
      expiredAt: Math.floor(expiresAt.getTime() / 1000),
    })

    return NextResponse.json({
      ok: true,
      topupId,
      amount,
      bonus,
      description,
      expiresAt: expiresAt.toISOString(),
      checkoutUrl: payment.checkoutUrl,
      qrCode: payment.qrCode ?? null,
    })
  } catch (error) {
    await admin.from('topups').update({ status: 'cancelled' }).eq('id', topupId).eq('status', 'pending')
    console.error('telegram payOS create payment failed', error)
    return NextResponse.json({ error: 'PAYOS_CREATE_FAILED' }, { status: 502 })
  }
}
