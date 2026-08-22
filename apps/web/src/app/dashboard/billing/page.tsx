import { BillingClient } from '@/components/BillingClient'
import { requireUser } from '@/lib/auth'

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { supabase, user } = await requireUser()
  const params = await searchParams
  const [{ data: wallet }, { data: topups }] = await Promise.all([
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).single(),
    supabase.from('topups').select('id,payable_vnd,amount_micros,bonus_micros,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
  ])

  return <BillingClient wallet={wallet} recentTopups={topups ?? []} welcome={params.welcome === '1'} />
}
