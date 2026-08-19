import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ensureUserAccount } from '@/lib/bootstrap-user'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Vui lòng điền đầy đủ email và mật khẩu' }, { status: 400 })
    }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error) {
      let msg = error.message
      if (msg.includes('Invalid login credentials')) {
        msg = 'Email hoặc mật khẩu không chính xác'
      } else if (msg.includes('Email not confirmed')) {
        msg = 'Tài khoản chưa được kích hoạt qua email'
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Đảm bảo Profile và Wallet luôn luôn tồn tại trong DB
    if (data?.user) {
      const admin = createAdminSupabase()
      await ensureUserAccount(admin, data.user, { seedBalance: false })
    }

    return NextResponse.json({ ok: true, user: data.user })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Lỗi đăng nhập hệ thống' }, { status: 500 })
  }
}
