import { redirect } from 'next/navigation'
import { createServerSupabase } from './supabase/server'

export async function requireUser() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}
