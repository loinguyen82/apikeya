import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ensureUserAccount } from '@/lib/bootstrap-user'

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

    // Production yêu cầu xác minh email để giảm account farming và email giả.
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: process.env.DISABLE_EMAIL_CONFIRMATION === 'true',
      user_metadata: {
        display_name: displayName || email.split('@')[0],
      },
    })

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('unique constraint')) {
        return NextResponse.json({ error: 'Không thể tạo tài khoản với thông tin này. Nếu email đã đăng ký, hãy đăng nhập hoặc khôi phục mật khẩu.' }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Trial credit phải được bật có chủ đích; mặc định tắt để tránh abuse bằng nhiều tài khoản.
    if (data?.user) {
      await ensureUserAccount(admin, data.user, {
        seedBalance: process.env.ENABLE_SIGNUP_TRIAL_CREDIT === 'true',
        displayName: displayName || email.split('@')[0],
      })
    }

    return NextResponse.json({ ok: true, user: data.user })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
