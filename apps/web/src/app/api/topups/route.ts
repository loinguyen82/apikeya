import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'
import {
  createPayOSOrderCode,
  createPayOSPaymentLink,
  isPayOSConfigured,
} from '@/lib/payos'

const MIN_TOPUP_VND = 1000
const TOPUP_STEP_VND = 1000
const TOPUP_TTL_MS = 30 * 60 * 1000

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  const client = await createServerSupabase()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const amount = Number(form.get('amount'))

  if (!Number.isSafeInteger(amount) || amount < MIN_TOPUP_VND || amount % TOPUP_STEP_VND !== 0) {
    return NextResponse.json(
      { error: 'Số tiền nạp tối thiểu 1.000đ và phải theo bước 1.000đ', code: 'INVALID_AMOUNT' },
      { status: 400 },
    )
  }

  const { count: activePendingCount, error: pendingLookupError } = await client
    .from('topups')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())

  if (pendingLookupError) {
    return NextResponse.json({ error: 'Không thể kiểm tra đơn nạp đang mở' }, { status: 503 })
  }
  if ((activePendingCount ?? 0) > 0) {
    return NextResponse.json({ error: 'Bạn đang có một đơn nạp chưa hết hạn' }, { status: 409 })
  }

  const bonus =
    amount >= 1000000
      ? Math.floor(amount * 0.08)
      : amount >= 500000
        ? Math.floor(amount * 0.05)
        : amount >= 200000
          ? Math.floor(amount * 0.02)
          : 0

  const admin = createAdminSupabase()
  await admin
    .from('topups')
    .update({ status: 'expired' })
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString())

  const topupId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + TOPUP_TTL_MS)
  const payosEnabled = isPayOSConfigured()
  const orderCode = payosEnabled ? createPayOSOrderCode() : null

  const { data, error } = await admin
    .from('topups')
    .insert({
      id: topupId,
      user_id: user.id,
      amount_micros: String(amount * 1000),
      bonus_micros: String(bonus * 1000),
      payable_vnd: amount,
      payment_provider: payosEnabled ? 'payos' : 'manual_vietqr',
      external_id: orderCode ? String(orderCode) : null,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Bạn đang có một đơn nạp chưa hết hạn' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (payosEnabled && orderCode) {
    const returnUrl = new URL(`/dashboard/billing?topup=${data.id}&payment=return`, req.url).toString()
    const cancelUrl = new URL(`/dashboard/billing?topup=${data.id}&payment=cancelled`, req.url).toString()
    const description = `APIVN${data.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`

    try {
      const payment = await createPayOSPaymentLink({
        orderCode,
        amount,
        description,
        returnUrl,
        cancelUrl,
        expiredAt: Math.floor(expiresAt.getTime() / 1000),
      })
      return NextResponse.redirect(payment.checkoutUrl, 303)
    } catch (paymentError) {
      await admin.from('topups').update({ status: 'cancelled' }).eq('id', data.id).eq('status', 'pending')
      console.error('payOS create payment failed', paymentError)
      return NextResponse.json(
        { error: 'Không thể tạo phiên thanh toán payOS. Vui lòng thử lại.', code: 'PAYOS_CREATE_FAILED' },
        { status: 502 },
      )
    }
  }

  return NextResponse.redirect(new URL(`/dashboard/billing?topup=${data.id}`, req.url), 303)
}
