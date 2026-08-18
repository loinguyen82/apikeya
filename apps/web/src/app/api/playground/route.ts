import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: { message: 'Bạn cần đăng nhập để dùng thử' } }, { status: 401 })
  }

  const body = await req.text()
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'http://localhost:8787'

  try {
    const upstream = await fetch(`${gatewayUrl}/internal/playground/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': process.env.GATEWAY_INTERNAL_TOKEN || '',
        'x-user-id': user.id,
        'idempotency-key': crypto.randomUUID(),
      },
      body,
    })

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'x-request-id': upstream.headers.get('x-request-id') ?? '',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: 'Không kết nối được tới cổng AI Gateway: ' + error.message } },
      { status: 500 }
    )
  }
}
