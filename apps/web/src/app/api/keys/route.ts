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

  let name = 'Default'
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

  name = name.trim()
  if (!name || name.length > 80) {
    return NextResponse.json({ error: 'Tên API Key phải từ 1 đến 80 ký tự', code: 'invalid_key_name' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { plaintext, prefix, lastFour } = generateApiKey()
  const hash = await sha256Hex(plaintext)

  const { data, error } = await admin
    .from('api_keys')
    .insert({ user_id: user.id, name, prefix, last_four: lastFour, secret_hash: hash, status: 'active' })
    .select('id,name,prefix,last_four,status,last_used_at,created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  const name = String(body?.name || '').trim()
  if (!id) return NextResponse.json({ error: 'Thiếu API Key ID', code: 'missing_key_id' }, { status: 400 })

  const admin = createAdminSupabase()
  if (action === 'rename') {
    if (!name || name.length > 80) {
      return NextResponse.json({ error: 'Tên API Key phải từ 1 đến 80 ký tự', code: 'invalid_key_name' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('api_keys')
      .update({ name })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id,name')
      .maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Không thể đổi tên API Key' }, { status: 404 })
    return NextResponse.json({ ok: true, key: data })
  }

  if (action === 'rotate') {
    const { plaintext, prefix, lastFour } = generateApiKey()
    const secretHash = await sha256Hex(plaintext)
    const { data, error } = await admin.rpc('rotate_api_key', {
      p_user_id: user.id,
      p_key_id: id,
      p_name: name || 'Rotated key',
      p_prefix: prefix,
      p_last_four: lastFour,
      p_secret_hash: secretHash,
    })
    if (error || !data) return NextResponse.json({ error: 'Không thể rotate API Key đang hoạt động' }, { status: 409 })
    return NextResponse.json({ ok: true, key: data, plaintext })
  }

  return NextResponse.json({ error: 'Action không hợp lệ', code: 'invalid_action' }, { status: 400 })
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
  const { data, error } = await admin.from('api_keys').update({ status: 'revoked' }).eq('id', id).eq('user_id', user.id).eq('status', 'active').select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Không thể thu hồi API Key' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'API Key không tồn tại hoặc đã bị thu hồi' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
