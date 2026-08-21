import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'

const DUPLICATE_AUTH_CODES = new Set(['email_exists', 'user_already_exists'])

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  try {
    const { email, password, displayName } = await req.json()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedName = String(displayName || '').trim()
    const normalizedPassword = String(password || '')

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ email và mật khẩu' }, { status: 400 })
    }
    if (normalizedPassword.length < 8) {
      return NextResponse.json({ error: 'Mật khẩu phải có tối thiểu 8 ký tự' }, { status: 400 })
    }

    const admin = createAdminSupabase()
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: normalizedPassword,
      email_confirm: true,
      user_metadata: { display_name: normalizedName || normalizedEmail.split('@')[0] },
    })

    if (createError || !created.user) {
      const code = createError?.code || ''

      if (code === 'email_address_invalid') {
        return NextResponse.json(
          { error: 'Email không hợp lệ. Vui lòng dùng địa chỉ email thật.' },
          { status: 400 },
        )
      }

      if (!DUPLICATE_AUTH_CODES.has(code)) {
        console.error('signup createUser failed', {
          code: code || 'missing_user',
          status: createError?.status,
        })
        return NextResponse.json(
          { error: 'Không thể tạo tài khoản lúc này. Vui lòng thử lại sau.' },
          { status: 503 },
        )
      }

      // Existing accounts keep a temporary recovery path. No confirmation email
      // is sent or required in the API-key-first customer flow.
      const existingClient = await createServerSupabase()
      const { error: existingLoginError } = await existingClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      })
      if (!existingLoginError) {
        return NextResponse.json({ ok: true, existing: true })
      }

      return NextResponse.json({
        error: 'Email này đã có tài khoản. Hãy đăng nhập bằng API key hoặc dùng đăng nhập cũ.',
      }, { status: 409 })
    }

    // auth.users trigger creates profile + wallet synchronously. Open a temporary
    // recovery session so a new customer can pay before receiving their API key.
    const serverClient = await createServerSupabase()
    const { error: loginError } = await serverClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    })
    if (loginError) {
      console.error('signup session bootstrap failed', {
        code: loginError.code,
        status: loginError.status,
      })
      return NextResponse.json({ error: 'Tài khoản đã tạo nhưng không thể mở phiên thanh toán' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, requiresTopup: true })
  } catch (err: any) {
    console.error('signup route failed', err)
    return NextResponse.json({ error: 'Lỗi hệ thống khi tạo tài khoản' }, { status: 500 })
  }
}
