import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'
import { generateApiKey, sha256Hex } from '@/lib/api-keys'

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
      // Existing accounts can still use the migration fallback once to enter the
      // dashboard and rotate/save their API key. Do not send confirmation email.
      const existingClient = await createServerSupabase()
      const { error: existingLoginError } = await existingClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      })
      if (!existingLoginError) {
        return NextResponse.json({ ok: true, existing: true, keyCreated: false })
      }

      return NextResponse.json({
        error: 'Email này đã có tài khoản. Hãy đăng nhập bằng API key hoặc dùng đăng nhập cũ.',
      }, { status: 409 })
    }

    // Profile + wallet are created synchronously by the auth.users trigger.
    const serverClient = await createServerSupabase()
    const { error: loginError } = await serverClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    })
    if (loginError) {
      return NextResponse.json({ error: 'Tài khoản đã tạo nhưng không thể mở phiên đăng nhập' }, { status: 500 })
    }

    const { plaintext, prefix } = generateApiKey()
    const secretHash = await sha256Hex(plaintext)
    const { error: keyError } = await admin.from('api_keys').insert({
      user_id: created.user.id,
      name: 'Default API Key',
      prefix,
      secret_hash: secretHash,
      status: 'active',
    })

    if (keyError) {
      return NextResponse.json({ ok: true, keyCreated: false })
    }

    return NextResponse.json({
      ok: true,
      keyCreated: true,
      plaintext,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
