import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint đã ngừng sử dụng. Dùng DELETE /api/keys.', code: 'endpoint_deprecated' },
    { status: 410, headers: { link: '</api/keys>; rel="successor-version"' } },
  )
}
