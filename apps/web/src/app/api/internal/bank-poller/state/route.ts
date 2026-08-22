import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { bankPollerSecret, safeEqual } from '@/lib/bank-poller-auth'

const GRACE_MS = 2 * 60 * 1000

export async function GET(req: NextRequest) {
  const secret = bankPollerSecret()
  const supplied = req.headers.get('x-bank-poller-secret') ?? ''

  if (!secret || !supplied || !safeEqual(supplied, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const now = Date.now()
  const activeAfter = new Date(now).toISOString()
  const graceAfter = new Date(now - GRACE_MS).toISOString()

  const [{ count: activeCount, error: activeError }, { count: graceCount, error: graceError }] = await Promise.all([
    admin
      .from('topups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('expires_at', activeAfter),
    admin
      .from('topups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('expires_at', graceAfter),
  ])

  if (activeError || graceError) {
    return NextResponse.json({ error: 'state_lookup_failed' }, { status: 503 })
  }

  return NextResponse.json({
    should_poll: (graceCount ?? 0) > 0,
    active_pending: activeCount ?? 0,
    grace_pending: Math.max(0, (graceCount ?? 0) - (activeCount ?? 0)),
    poll_interval_ms: 60_000,
    qr_ttl_ms: 15 * 60_000,
  })
}
