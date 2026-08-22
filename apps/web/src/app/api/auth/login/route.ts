import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'
import { sha256Hex } from '@/lib/api-keys'

async function loginWithApiKey(apiKey: string) {
  const normalizedKey = apiKey.trim()
  if (!normalizedKey.startsWith('sk-') || normalizedKey.length < 20 || normalizedKey.length > 200) {
    return NextResponse.json({ error: 'API Key không hợp lệ' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const secretHash = await sha256Hex(normalizedKey)
  const { data: keyRow, error: keyError } = await admin
    .from('api_keys')
    .select('id,user_id')
    .eq('secret_hash', secretHash)
    .eq('status', 'active')
    .maybeSingle()

  if (keyError || !keyRow) {
    return NextResponse.json({ error: 'API Key không hợp lệ hoặc đã bị thu hồi' }, { status: 401 })
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(keyRow.user_id)
  const email = userData?.user?.email
  if (userError || !email) {
    return NextResponse.json({ error: 'Không thể mở phiên đăng nhập cho API Key này' }, { status: 401 })
  }

  // Create a one-time Supabase token without sending mail, then exchange it
  // through the SSR client so the existing dashboard session/RLS model stays intact.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = (linkData?.properties as { hashed_token?: string } | null)?.hashed_token
  if (linkError || !tokenHash) {
    return NextResponse.json({ error: 'Không thể tạo phiên đăng nhập' }, { status: 500 })
  }

  const supabase = await createServerSupabase()
  const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })

  if (verifyError || sessionData.user?.id !== keyRow.user_id) {
    await supabase.auth.signOut().catch(() => undefined)
    return NextResponse.json({ error: 'Không thể xác thực API Key' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, mode: 'api_key' })
}

async function loginWithAccount(email: string, password: string) {
  if (!email || !password) {
    return NextResponse.json({ error: 'Vui lòng nhập email và mật khẩu' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return NextResponse.json({ error: 'Email hoặc mật khẩu không chính xác' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, mode: 'account_recovery' })
}

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  try {
    const body = await req.json()
    const apiKey = String(body?.apiKey || '').trim()
    if (apiKey) return loginWithApiKey(apiKey)

    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    return loginWithAccount(email, password)
  } catch {
    return NextResponse.json({ error: 'Lỗi hệ thống khi đăng nhập' }, { status: 500 })
  }
}
