import { requireUser } from '@/lib/auth'
import { ApiKeysClient } from '@/components/ApiKeysClient'

export default async function ApiKeysPage() {
  const { supabase, user } = await requireUser()

  const { data: keys } = await supabase
    .from('api_keys')
    .select('id,name,prefix,status,last_used_at,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return <ApiKeysClient initialKeys={keys || []} />
}
