import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    service: 'apivn-web',
    version: 'payos-1k-v1',
  })
}
