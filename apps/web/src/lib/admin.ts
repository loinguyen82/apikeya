import { redirect } from 'next/navigation'
import { requireUser } from './auth'
import { createAdminSupabase } from './supabase/admin'

type AdminUser = { id: string; email?: string | null }

export async function isAdminUser(supabase: any, user: AdminUser): Promise<boolean> {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  const isEmailAdmin = Boolean(user.email && adminEmails.includes(user.email.toLowerCase()))
  if (isEmailAdmin) return true

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error('ADMIN_PROFILE_LOOKUP_FAILED')
  return profile?.role === 'admin'
}

export async function requireAdmin() {
  const ctx = await requireUser()
  if (!(await isAdminUser(ctx.supabase, ctx.user))) {
    redirect('/dashboard')
  }

  return { ...ctx, admin: createAdminSupabase() }
}
