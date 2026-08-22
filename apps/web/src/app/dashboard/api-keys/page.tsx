import { requireUser } from '@/lib/auth'
import { ApiKeysClient } from '@/components/ApiKeysClient'

export default async function ApiKeysPage() {
  const { supabase, user } = await requireUser()

  const [{ data: keys }, { data: requestKeys }] = await Promise.all([
    supabase.from('api_keys').select('id,name,prefix,last_four,status,last_used_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('api_requests').select('api_key_id').eq('user_id', user.id).not('api_key_id', 'is', null),
  ])
  const counts = new Map<string, number>()
  for (const request of requestKeys ?? []) counts.set(request.api_key_id, (counts.get(request.api_key_id) ?? 0) + 1)
  const rows = (keys ?? []).map((key: any) => ({ ...key, request_count: counts.get(key.id) ?? 0 }))

  return <ApiKeysClient initialKeys={rows} />
}
