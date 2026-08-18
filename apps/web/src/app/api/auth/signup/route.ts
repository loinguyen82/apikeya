import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { email, password, displayName } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ email và mật khẩu' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có tối thiểu 6 ký tự' }, { status: 400 })
    }

    const admin = createAdminSupabase()

    // Tạo user với email_confirm: true để tự động xác thực ngay lập tức, không bao giờ bị chặn
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName || email.split('@')[0],
      },
    })

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('unique constraint')) {
        return NextResponse.json({ error: 'Email này đã được đăng ký. Vui lòng đăng nhập.' }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, user: data.user })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
