import { requireUser } from '@/lib/auth'
import { ApiKeysClient } from '@/components/ApiKeysClient'

export default async function ApiKeysPage() {
  const { supabase, user } = await requireUser()

  const { data: key } = await supabase
    .from('api_keys')
    .select('id,name,prefix,last_four,status,last_used_at,created_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let requestCount = 0
  if (key?.id) {
    const { count } = await supabase
      .from('api_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('api_key_id', key.id)
    requestCount = count ?? 0
  }

  return <ApiKeysClient initialKey={key ? { ...key, request_count: requestCount } : null} />
}
