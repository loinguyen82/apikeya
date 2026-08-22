import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import {
  A6_MARKETPLACE_HOT_MODELS_URL,
  DEFAULT_A6_RETAIL_MARKUP_VND_PER_MTOKEN,
  DEFAULT_A6_VND_PER_USD,
  convertA6MarketplacePriceToVnd,
  findA6MarketplaceItem,
  parseA6MarketplaceItems,
} from '@/lib/a6-marketplace'

type AdminContext = { user: { id: string }; admin: any }

type PricingRow = {
  modelId: string
  displayName: string
  sourceModel: string | null
  minInputPriceMicros: string | null
  inputCostVndPerMToken: number | null
  suggestedRetailVndPerMToken: number | null
  currentRetailVndPerMToken: number | null
  listingCount: number
  providerRoute: boolean
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isAdminUser(supabase, user))) return null
  return { user: { id: user.id }, admin: createAdminSupabase() }
}

async function fetchMarketplaceItems(requireApiKey: boolean) {
  const apiKey = process.env.A6API_KEY?.trim()
  if (requireApiKey && !apiKey) throw new Error('A6_API_KEY_NOT_CONFIGURED')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    const response = await fetch(A6_MARKETPLACE_HOT_MODELS_URL, {
      cache: 'no-store',
      headers,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`A6_MARKETPLACE_HTTP_${response.status}`)
    return { items: parseA6MarketplaceItems(await response.json()), authenticated: Boolean(apiKey) }
  } finally {
    clearTimeout(timeout)
  }
}

async function loadPricingRows(admin: any, items: ReturnType<typeof parseA6MarketplaceItems>, rate: number, markup: number): Promise<PricingRow[]> {
  const [{ data: models, error: modelsError }, { data: routes, error: routesError }] = await Promise.all([
    admin.from('models').select('id,display_name,pricing_mode,retail_flat_micros_per_mtoken').order('display_name'),
    admin.from('provider_models').select('model_id').eq('provider_id', 'a6api').eq('enabled', true),
  ])
  if (modelsError) throw modelsError
  if (routesError) throw routesError
  const routeIds = new Set((routes ?? []).map((route: any) => route.model_id))

  return (models ?? []).map((model: any) => {
    const match = findA6MarketplaceItem(model.id, items)
    const inputCostVndPerMToken = match
      ? convertA6MarketplacePriceToVnd(match.minInputPriceMicros, rate)
      : null
    return {
      modelId: model.id,
      displayName: model.display_name,
      sourceModel: match?.modelName ?? null,
      minInputPriceMicros: match?.minInputPriceMicros ?? null,
      inputCostVndPerMToken,
      suggestedRetailVndPerMToken: inputCostVndPerMToken == null ? null : inputCostVndPerMToken + markup,
      currentRetailVndPerMToken: model.retail_flat_micros_per_mtoken == null
        ? null
        : Number(BigInt(model.retail_flat_micros_per_mtoken) / 1000n),
      listingCount: match?.listingCount ?? 0,
      providerRoute: routeIds.has(model.id),
    }
  })
}

function configFrom(value: unknown) {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    rate: positiveNumber(body.rate, Number(process.env.A6_MARKETPLACE_VND_PER_USD) || DEFAULT_A6_VND_PER_USD),
    markup: positiveNumber(body.markup, Number(process.env.A6_MARKETPLACE_RETAIL_MARKUP_VND_PER_MTOKEN) || DEFAULT_A6_RETAIL_MARKUP_VND_PER_MTOKEN),
    modelIds: Array.isArray(body.modelIds) ? new Set(body.modelIds.filter((id): id is string => typeof id === 'string')) : null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const context = await getAdminContext()
    if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const config = configFrom({
      rate: request.nextUrl.searchParams.get('rate'),
      markup: request.nextUrl.searchParams.get('markup'),
    })
    const scan = await fetchMarketplaceItems(false)
    const models = await loadPricingRows(context.admin, scan.items, config.rate, config.markup)
    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: A6_MARKETPLACE_HOT_MODELS_URL,
      authenticated: scan.authenticated,
      rateVndPerUsd: config.rate,
      markupVndPerMToken: config.markup,
      assumptions: {
        rawUnit: 'A6 micro-USD per 1M input tokens (public endpoint does not declare currency)',
        outputPrice: 'not returned by hot-models; update mirrors input cost for provider output',
      },
      models,
      marketplaceItemCount: scan.items.length,
    })
  } catch (error: any) {
    console.error('A6 marketplace pricing scan failed', error)
    const message = error?.message === 'A6_API_KEY_NOT_CONFIGURED' ? 'a6_api_key_not_configured' : 'a6_marketplace_pricing_failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAdminContext()
    if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const config = configFrom(await request.json().catch(() => ({})))
    const scan = await fetchMarketplaceItems(true)
    const rows = await loadPricingRows(context.admin, scan.items, config.rate, config.markup)
    const selectedRows = rows.filter((row) => !config.modelIds || config.modelIds.has(row.modelId))
    const updated: Array<Record<string, unknown>> = []
    const skipped: Array<Record<string, unknown>> = []
    const failed: Array<Record<string, unknown>> = []

    for (const row of selectedRows) {
      if (row.inputCostVndPerMToken == null || row.suggestedRetailVndPerMToken == null || !row.providerRoute) {
        skipped.push({ modelId: row.modelId, reason: row.inputCostVndPerMToken == null ? 'no_marketplace_match' : 'no_a6_provider_route' })
        continue
      }

      // Never lower a price that is already above the new recommendation.
      const nextRetailVnd = Math.max(row.currentRetailVndPerMToken ?? 0, row.suggestedRetailVndPerMToken)
      const costMicros = String(BigInt(row.inputCostVndPerMToken) * 1000n)
      const retailMicros = String(BigInt(nextRetailVnd) * 1000n)
      try {
        const modelResult = await context.admin
          .from('models')
          .update({ retail_flat_micros_per_mtoken: retailMicros, updated_at: new Date().toISOString() })
          .eq('id', row.modelId)
        if (modelResult.error) throw modelResult.error

        const routeResult = await context.admin
          .from('provider_models')
          .update({ upstream_input_micros_per_mtoken: costMicros, upstream_output_micros_per_mtoken: costMicros, updated_at: new Date().toISOString() })
          .eq('provider_id', 'a6api')
          .eq('model_id', row.modelId)
        if (routeResult.error) throw routeResult.error

        updated.push({ modelId: row.modelId, costVndPerMToken: row.inputCostVndPerMToken, retailVndPerMToken: nextRetailVnd })
      } catch (error: any) {
        failed.push({ modelId: row.modelId, error: error?.message || 'update_failed' })
      }
    }

    const auditResult = await context.admin.from('admin_audit_log').insert({
      actor_user_id: context.user.id,
      action: 'a6_marketplace_price_sync',
      entity_type: 'model_pricing_batch',
      entity_id: 'a6api',
      before_json: { rateVndPerUsd: config.rate, markupVndPerMToken: config.markup },
      after_json: { updated, skipped, failed, authenticated: true },
    })
    if (auditResult.error) console.error('A6 marketplace audit log failed', auditResult.error)

    return NextResponse.json({ ok: failed.length === 0, authenticated: true, updated, skipped, failed })
  } catch (error: any) {
    console.error('A6 marketplace pricing update failed', error)
    const message = error?.message === 'A6_API_KEY_NOT_CONFIGURED' ? 'a6_api_key_not_configured' : 'a6_marketplace_pricing_update_failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
