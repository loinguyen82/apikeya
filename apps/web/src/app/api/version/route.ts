import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    service: 'apivn-web',
    version: 'developer-console-v1',
  })
}
