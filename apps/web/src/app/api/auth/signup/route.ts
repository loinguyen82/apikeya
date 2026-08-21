import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { ensureUserAccount } from '@/lib/bootstrap-user'
import { rejectCrossSiteMutation } from '@/lib/security'

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  try {
    const { email, password, displayName } = await req.json()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedName = String(displayName || '').trim()

    if (!normalizedEmail || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ email và mật khẩu' }, { status: 400 })
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Mật khẩu phải có tối thiểu 8 ký tự' }, { status: 400 })
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { display_name: normalizedName || normalizedEmail.split('@')[0] },
        emailRedirectTo: `${appUrl}/login?verified=1`,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message || 'Không thể tạo tài khoản' }, { status: 400 })
    }

    if (data.user) {
      const admin = createAdminSupabase()
      await ensureUserAccount(admin, data.user, {
        seedBalance: false,
        displayName: normalizedName || normalizedEmail.split('@')[0],
      })
    }

    return NextResponse.json({
      ok: true,
      requiresConfirmation: !data.session,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
