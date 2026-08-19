import { requireAdmin } from '@/lib/admin'
import { AdminTopupsClient } from '@/components/AdminTopupsClient'

export default async function AdminTopupsPage() {
  const { admin } = await requireAdmin()

  const [{ data: topups }, { data: userData }] = await Promise.all([
    admin.from('topups').select('*').order('created_at', { ascending: false }).limit(100),
    admin.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: { users: [] } })),
  ])

  const userMap = new Map<string, string>()
  if (userData?.users) {
    for (const u of userData.users) {
      userMap.set(u.id, u.email || '')
    }
  }

  const enrichedTopups = (topups || []).map((t: any) => ({
    ...t,
    userEmail: userMap.get(t.user_id) || t.user_id.slice(0, 8),
  }))

  const pendingTopups = enrichedTopups.filter((t) => t.status === 'pending')
  const historyTopups = enrichedTopups.filter((t) => t.status !== 'pending')

  return <AdminTopupsClient pendingTopups={pendingTopups} historyTopups={historyTopups} />
}
