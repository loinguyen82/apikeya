import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { rejectCrossSiteMutation } from '@/lib/security'

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  const originError = rejectCrossSiteMutation(req)
  if (originError) return originError

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: { message: 'Bạn cần đăng nhập để dùng thử' } }, { status: 401 })
  }

  const body = await req.text()
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL?.replace(/\/+$/, '')
  const internalToken = process.env.GATEWAY_INTERNAL_TOKEN
  const assertionSecret = process.env.GATEWAY_USER_ASSERTION_SECRET

  if (!gatewayUrl || !internalToken || !assertionSecret) {
    return NextResponse.json(
      { error: { message: 'Playground chưa được cấu hình đầy đủ trên máy chủ' } },
      { status: 503 },
    )
  }

  const userAssertion = await hmacSha256Hex(assertionSecret, user.id)

  try {
    const upstream = await fetch(`${gatewayUrl}/internal/playground/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': internalToken,
        'x-user-id': user.id,
        'x-user-assertion': `sha256=${userAssertion}`,
        'idempotency-key': crypto.randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(60_000),
    })

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'x-request-id': upstream.headers.get('x-request-id') ?? '',
      },
    })
  } catch (error: any) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return NextResponse.json(
      { error: { message: timedOut ? 'AI Gateway phản hồi quá thời gian cho phép' : 'Không kết nối được tới AI Gateway' } },
      { status: timedOut ? 504 : 502 },
    )
  }
}
