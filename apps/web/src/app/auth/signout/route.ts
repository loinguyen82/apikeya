import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  return NextResponse.redirect(new URL('/login', origin), 303)
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  return NextResponse.redirect(new URL('/login', origin), 303)
}
