import { redirect } from 'next/navigation'
import { requireUser } from './auth'
import { createAdminSupabase } from './supabase/admin'

export async function requireAdmin() {
  const ctx = await requireUser()
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const isEmailAdmin = ctx.user.email && adminEmails.includes(ctx.user.email.toLowerCase())

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('role')
    .eq('id', ctx.user.id)
    .single()

  const isRoleAdmin = profile?.role === 'admin'

  if (!isEmailAdmin && !isRoleAdmin) {
    redirect('/dashboard')
  }

  return { ...ctx, admin: createAdminSupabase() }
}
