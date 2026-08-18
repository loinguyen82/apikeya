import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

const allowedAmounts = new Set([50000, 100000, 200000, 500000, 1000000])

export async function POST(req: NextRequest) {
  const client = await createServerSupabase()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const amount = Number(form.get('amount'))

  if (!allowedAmounts.has(amount)) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }

  const bonus =
    amount >= 1000000
      ? Math.floor(amount * 0.1)
      : amount >= 500000
      ? Math.floor(amount * 0.05)
      : 0

  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('topups')
    .insert({
      user_id: user.id,
      amount_micros: String(amount * 1000),
      bonus_micros: String(bonus * 1000),
      payable_vnd: amount,
      payment_provider: 'manual_vietqr',
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.redirect(new URL(`/dashboard/billing?topup=${data.id}`, req.url), 303)
}
