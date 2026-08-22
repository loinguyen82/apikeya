import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  try {
    const body = await req.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    if (!email || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập email và mật khẩu' }, { status: 400 })
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không chính xác' }, { status: 401 })
    }

    return NextResponse.json({ ok: true, mode: 'account' })
  } catch {
    return NextResponse.json({ error: 'Lỗi hệ thống khi đăng nhập' }, { status: 500 })
  }
}
