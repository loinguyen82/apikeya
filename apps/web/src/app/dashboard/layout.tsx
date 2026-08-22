import { AppShell } from '@/components/AppShell'
import { requireUser } from '@/lib/auth'
import { formatVndFromMicros } from '@/lib/money'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser()
  const [{ data: profile }, { data: wallet }] = await Promise.all([
    supabase.from('profiles').select('display_name,role').eq('id', user.id).maybeSingle(),
    supabase.from('wallets').select('available_micros').eq('user_id', user.id).maybeSingle(),
  ])
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase())
  const isAdmin = profile?.role === 'admin' || Boolean(user.email && adminEmails.includes(user.email.toLowerCase()))

  return (
    <AppShell
      user={{
        displayName: profile?.display_name ?? user.user_metadata?.display_name ?? '',
        email: user.email ?? '',
        balanceLabel: formatVndFromMicros(wallet?.available_micros ?? '0'),
        isAdmin,
      }}
    >
      {children}
    </AppShell>
  )
}
