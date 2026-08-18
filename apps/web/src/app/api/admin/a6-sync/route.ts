import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || user.email?.toLowerCase() !== (process.env.ADMIN_EMAILS || 'loi822004@gmail.com').toLowerCase()) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    let usdBalance = body.usd != null ? Number(body.usd) : null
    const rate = Number(body.rate) || 25400

    // Nếu không truyền USD tùy chỉnh, thử gọi A6API để lấy số dư trực tiếp
    if (usdBalance == null) {
      try {
        const a6Res = await fetch('https://api.a6api.com/v1/dashboard/billing/subscription', {
          headers: {
            Authorization: `Bearer ${process.env.A6API_KEY || 'sk-kU4qv9ydZ3os8PT60TkM8JvyuKxIdx6MFSzh63JucqLs00dE'}`,
          },
        })
        if (a6Res.ok) {
          const a6Data = await a6Res.json()
          usdBalance = a6Data.hard_limit_usd || a6Data.system_hard_limit_usd || 4.0
        }
      } catch {
        usdBalance = 4.0 // Fallback mặc định 4$
      }
    }

    if (usdBalance == null || isNaN(usdBalance)) {
      usdBalance = 4.0
    }

    const vnd = Math.round(usdBalance * rate)
    const micros = BigInt(vnd) * 1000n

    // Cập nhật số dư VNĐ cho ví của Admin
    const admin = createAdminSupabase()
    const { error: updateError } = await admin
      .from('wallets')
      .update({
        available_micros: micros.toString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      usd: usdBalance,
      rate,
      vnd,
      available_micros: micros.toString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
