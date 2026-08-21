import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'

function createSignupClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' } },
  )
}

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
    const signupClient = createSignupClient()
    const { data, error } = await signupClient.auth.signUp({
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

    // Profile + wallet are created only by the auth.users database trigger.
    // Do not bootstrap data.user here: repeated signup intentionally returns a
    // non-enumerating response and must not be treated as a newly-created user.

    // Nếu project tắt email confirmation (dev/local), tạo cookie session bằng SSR client.
    if (data.session) {
      const serverClient = await createServerSupabase()
      const { error: loginError } = await serverClient.auth.signInWithPassword({ email: normalizedEmail, password })
      if (!loginError) return NextResponse.json({ ok: true, requiresConfirmation: false })
    }

    return NextResponse.json({ ok: true, requiresConfirmation: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
