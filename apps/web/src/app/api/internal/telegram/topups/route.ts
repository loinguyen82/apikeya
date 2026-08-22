import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

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

function bankConfig() {
  return {
    bankId: process.env.NEXT_PUBLIC_BANK_ID || 'VCB',
    bankName: process.env.NEXT_PUBLIC_BANK_NAME || 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)',
    accountNo: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NO || '9345521253',
    accountName: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'NGUYEN DINH LOI',
  }
}

function paymentDetails(topupId: string, amount: number) {
  const bank = bankConfig()
  const memo = `NAP ${topupId.slice(0, 8).toUpperCase()}`
  const accountNo = bank.accountNo.replace(/\s+/g, '')
  const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bank.bankId)}-${encodeURIComponent(accountNo)}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(bank.accountName)}`
  return { ...bank, accountNo, memo, qrUrl }
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

  const { data: existing, error: existingError } = await admin
    .from('topups')
    .select('id,payable_vnd,bonus_micros,expires_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: 'TOPUP_LOOKUP_FAILED' }, { status: 503 })
  }
  if (existing) {
    const details = paymentDetails(existing.id, Number(existing.payable_vnd))
    return NextResponse.json({
      error: 'ACTIVE_TOPUP_EXISTS',
      topupId: existing.id,
      amount: Number(existing.payable_vnd),
      bonus: Number(BigInt(existing.bonus_micros ?? 0) / 1000n),
      expiresAt: existing.expires_at,
      ...details,
    }, { status: 409 })
  }

  const topupId = crypto.randomUUID()
  const expiresAt = new Date(now.getTime() + TOPUP_TTL_MS)
  const bonus = bonusFor(amount)

  const { error: insertError } = await admin.from('topups').insert({
    id: topupId,
    user_id: userId,
    amount_micros: String(amount * 1000),
    bonus_micros: String(bonus * 1000),
    payable_vnd: amount,
    payment_provider: 'manual_vietqr',
    external_id: null,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'ACTIVE_TOPUP_EXISTS' }, { status: 409 })
    }
    return NextResponse.json({ error: 'TOPUP_CREATE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    topupId,
    amount,
    bonus,
    expiresAt: expiresAt.toISOString(),
    ...paymentDetails(topupId, amount),
  })
}
