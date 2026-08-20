import { requireUser } from '@/lib/auth'
import { BillingClient } from '@/components/BillingClient'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string }>
}) {
  const { supabase, user } = await requireUser()
  const params = await searchParams

  const [{ data: wallet }, { data: topups }, { data: currentTopup }] = await Promise.all([
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).single(),
    supabase.from('topups').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    params.topup
      ? supabase.from('topups').select('*').eq('id', params.topup).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <BillingClient
      wallet={wallet}
      currentTopup={
        currentTopup?.data ||
        (topups && topups.length > 0 && topups[0].status === 'pending' && new Date(topups[0].expires_at) > new Date()
          ? topups[0]
          : null)
      }
      recentTopups={topups || []}
    />
  )
}
