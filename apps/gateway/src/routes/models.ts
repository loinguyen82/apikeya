import { Hono } from 'hono'
import type { Env } from '../env.js'
import { adminDb } from '../repositories/supabase.js'

export const modelsRoute = new Hono<{ Bindings: Env }>()

modelsRoute.get('/', async (c) => {
  const db = adminDb(c.env)
  const { data, error } = await db
    .from('models')
    .select('id,display_name,status,context_window_tokens,max_output_tokens,tokenizer_family')
    .neq('status', 'disabled')
    .order('display_name')

  if (error) return c.json({ error: { message: 'Không tải được danh sách model' } }, 500)

  return c.json({
    object: 'list',
    data: (data ?? []).map((m: { id: string; display_name: string; status: string; context_window_tokens?: number | null; max_output_tokens?: number; tokenizer_family?: string | null }) => ({
      id: m.id,
      object: 'model',
      owned_by: 'gateway',
      name: m.display_name,
      status: m.status,
      context_window_tokens: m.context_window_tokens ?? null,
      max_output_tokens: m.max_output_tokens ?? null,
      tokenizer_family: m.tokenizer_family ?? null,
    })),
  })
})
