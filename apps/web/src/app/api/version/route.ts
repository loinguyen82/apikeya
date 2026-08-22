import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    service: 'apivn-web',
    version: 'developer-console-v1',
    revision: process.env.NEXT_PUBLIC_DEPLOY_SHA || 'local',
  })
}
