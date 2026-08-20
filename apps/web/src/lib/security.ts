import { NextRequest, NextResponse } from 'next/server'

export function rejectCrossSiteMutation(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin')
  if (!origin) return null

  try {
    if (new URL(origin).origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: 'cross_site_request_rejected' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }

  return null
}
