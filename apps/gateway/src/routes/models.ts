import { Hono } from 'hono'
import type { Env } from '../env'
import { adminDb } from '../repositories/supabase'

export const modelsRoute = new Hono<{ Bindings: Env }>()

modelsRoute.get('/', async (c) => {
  const db = adminDb(c.env)
  const { data, error } = await db
    .from('models')
    .select('id,display_name,status')
    .neq('status', 'disabled')
    .order('display_name')

  if (error) return c.json({ error: { message: 'Không tải được danh sách model' } }, 500)

  return c.json({
    object: 'list',
    data: (data ?? []).map((m) => ({
      id: m.id,
      object: 'model',
      owned_by: 'gateway',
      name: m.display_name,
      status: m.status,
    })),
  })
})
