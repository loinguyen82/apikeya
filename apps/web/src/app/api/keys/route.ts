import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'
import { generateApiKey, sha256Hex } from '@/lib/api-keys'

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  const userClient = await createServerSupabase()
  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let name = 'API Key'
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      if (body.name) name = body.name.trim()
    } else if (contentType.includes('form')) {
      const form = await req.formData()
      const n = form.get('name')
      if (n) name = String(n).trim()
    }
  } catch {
    // default name
  }

  const admin = createAdminSupabase()
  const { data: currentKey, error: currentKeyError } = await admin
    .from('api_keys')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (currentKeyError) return NextResponse.json({ error: 'Không thể kiểm tra API key hiện tại' }, { status: 500 })

  // First key is unlocked only after money has actually been credited to the wallet.
  // This makes creating extra free accounts useless while still allowing paid users
  // to rotate credentials even after their current balance reaches zero.
  if (!currentKey) {
    const { data: wallet, error: walletError } = await admin
      .from('wallets')
      .select('available_micros')
      .eq('user_id', user.id)
      .single()

    const availableMicros = BigInt(wallet?.available_micros ?? 0)
    if (walletError || availableMicros <= 0n) {
      return NextResponse.json({
        error: 'Hãy nạp tiền thành công trước khi tạo API key đầu tiên',
        code: 'TOPUP_REQUIRED',
      }, { status: 402 })
    }
  }

  const { plaintext, prefix } = generateApiKey()
  const hash = await sha256Hex(plaintext)

  // One user = one active credential. Rotation never creates a new wallet/quota.
  if (currentKey) {
    const { error: revokeError } = await admin
      .from('api_keys')
      .update({ status: 'revoked' })
      .eq('id', currentKey.id)
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (revokeError) return NextResponse.json({ error: 'Không thể rotate API key hiện tại' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('api_keys')
    .insert({ user_id: user.id, name, prefix, secret_hash: hash, status: 'active' })
    .select('id,name,prefix,created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, rotated: Boolean(currentKey), key: data, plaintext })
}

export async function DELETE(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  const userClient = await createServerSupabase()
  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Missing key id' }, { status: 400 })

  const admin = createAdminSupabase()
  const { error } = await admin.from('api_keys').update({ status: 'revoked' }).eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
