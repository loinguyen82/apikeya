import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  try {
    const { email } = await req.json()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) return NextResponse.json({ error: 'Vui lòng nhập email' }, { status: 400 })

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: { emailRedirectTo: `${appUrl}/login?verified=1` },
    })

    if (error) return NextResponse.json({ error: error.message || 'Không thể gửi lại email xác minh' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Không thể gửi lại email xác minh' }, { status: 500 })
  }
}
