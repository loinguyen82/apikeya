import { NextResponse } from 'next/server'
import { isLiveBillingEnabled } from '@/lib/billing-mode'

export const dynamic = 'force-dynamic'

export function GET() {
  const billingLive = isLiveBillingEnabled()
  const payosSecretCount = [
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY,
  ].filter(Boolean).length

  const checks = {
    supabasePublic: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    supabaseAdmin: Boolean(
      process.env.SUPABASE_ADMIN_SECRET ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    gateway: Boolean(
      process.env.NEXT_PUBLIC_GATEWAY_BASE_URL &&
        process.env.GATEWAY_INTERNAL_TOKEN &&
        process.env.GATEWAY_USER_ASSERTION_SECRET,
    ),
    paymentConfiguration: !billingLive || payosSecretCount === 3,
  }

  const healthy = Object.values(checks).every(Boolean)
  return NextResponse.json(
    {
      service: 'apivn-web',
      status: healthy ? 'ok' : 'misconfigured',
      paymentMode: billingLive ? 'payos' : 'mock',
      checks,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
