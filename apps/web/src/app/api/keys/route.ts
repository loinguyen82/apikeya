import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'
import { generateApiKey, sha256Hex } from '@/lib/api-keys'

const KEY_SELECT = 'id,name,prefix,last_four,status,last_used_at,created_at'

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  const userClient = await createServerSupabase()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminSupabase()
  const { data: existing, error: lookupError } = await admin
    .from('api_keys')
    .select(KEY_SELECT)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: 'Không thể kiểm tra API Key hiện tại' }, { status: 503 })
  if (existing) {
    return NextResponse.json(
      { error: 'Mỗi tài khoản chỉ được dùng một API Key. Hãy reset key hiện tại nếu cần đổi.', code: 'single_api_key_only', key: existing },
      { status: 409 },
    )
  }

  const { plaintext, prefix, lastFour } = generateApiKey()
  const secretHash = await sha256Hex(plaintext)
  const { data, error } = await admin
    .from('api_keys')
    .insert({
      user_id: user.id,
      name: 'Default',
      prefix,
      last_four: lastFour,
      secret_hash: secretHash,
      status: 'active',
    })
    .select(KEY_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Tài khoản đã có API Key đang hoạt động', code: 'single_api_key_only' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Không thể tạo API Key' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, key: data, plaintext }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  const userClient = await createServerSupabase()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '')
  const action = String(body?.action || '')
  if (!id) return NextResponse.json({ error: 'Thiếu API Key ID', code: 'missing_key_id' }, { status: 400 })
  if (action !== 'rotate') {
    return NextResponse.json({ error: 'Chỉ hỗ trợ reset API Key', code: 'invalid_action' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { plaintext, prefix, lastFour } = generateApiKey()
  const secretHash = await sha256Hex(plaintext)
  const { data, error } = await admin.rpc('rotate_api_key', {
    p_user_id: user.id,
    p_key_id: id,
    p_name: 'Default',
    p_prefix: prefix,
    p_last_four: lastFour,
    p_secret_hash: secretHash,
  })

  if (error || !data) {
    return NextResponse.json({ error: 'Không thể reset API Key đang hoạt động' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, key: data, plaintext })
}

// Compatibility endpoint for old clients. The new UI uses reset rather than revoke.
export async function DELETE(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  const userClient = await createServerSupabase()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Missing key id' }, { status: 400 })

  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('api_keys')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Không thể thu hồi API Key' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'API Key không tồn tại hoặc đã bị thu hồi' }, { status: 404 })

  await admin.from('telegram_account_links').delete().eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
