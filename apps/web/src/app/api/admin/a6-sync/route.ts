import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { getA6LiveBalance } from '@/lib/a6'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!(await isAdminUser(supabase, user))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    let usdBalance = body.usd != null ? Number(body.usd) : null
    const rate = Number(body.rate) || 25400

    // Nếu không truyền USD tùy chỉnh, lấy số dư live; lỗi upstream không được biến thành số dư giả.
    if (usdBalance == null) {
      try {
        usdBalance = (await getA6LiveBalance()).usd
      } catch {
        return NextResponse.json({ error: 'A6 balance unavailable' }, { status: 502 })
      }
    }

    if (usdBalance == null || !Number.isFinite(usdBalance) || usdBalance < 0) {
      return NextResponse.json({ error: 'invalid_a6_balance' }, { status: 400 })
    }

    const vnd = Math.round(usdBalance * rate)
    return NextResponse.json({
      ok: true,
      usd: usdBalance,
      rate,
      vnd,
      available_micros: String(BigInt(vnd) * 1000n),
      synced: false,
      message: 'A6 balance fetched; wallet was not overwritten.',
    })
  } catch (err: any) {
    console.error('A6 sync failed', err)
    return NextResponse.json({ error: 'a6_sync_failed' }, { status: 500 })
  }
}
