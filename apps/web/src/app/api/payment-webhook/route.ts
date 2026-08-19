import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-webhook-signature')
  const secret = process.env.PAYMENT_WEBHOOK_SECRET

  if (!secret || !signature || signature !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const payload = (await req.json()) as {
    topup_id?: string
    external_id?: string
    paid?: boolean
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
