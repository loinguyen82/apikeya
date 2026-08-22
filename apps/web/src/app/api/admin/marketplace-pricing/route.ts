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

function positiveNumber(value: string | null, fallback: number): number {
  const parsed = value == null ? NaN : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !(await isAdminUser(supabase, user))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const rate = positiveNumber(
      request.nextUrl.searchParams.get('rate'),
      Number(process.env.A6_MARKETPLACE_VND_PER_USD) || DEFAULT_A6_VND_PER_USD,
    )
    const markup = positiveNumber(
      request.nextUrl.searchParams.get('markup'),
      Number(process.env.A6_MARKETPLACE_RETAIL_MARKUP_VND_PER_MTOKEN) || DEFAULT_A6_RETAIL_MARKUP_VND_PER_MTOKEN,
    )

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    let response: Response
    try {
      response = await fetch(A6_MARKETPLACE_HOT_MODELS_URL, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) {
      return NextResponse.json({ error: 'a6_marketplace_unavailable', status: response.status }, { status: 502 })
    }

    const items = parseA6MarketplaceItems(await response.json())
    const admin = createAdminSupabase()
    const { data: models, error: modelsError } = await admin
      .from('models')
      .select('id,display_name,retail_flat_micros_per_mtoken')
      .order('display_name')
    if (modelsError) throw modelsError

    const modelRows = (models ?? []).map((model: any) => {
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
      }
    })

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: A6_MARKETPLACE_HOT_MODELS_URL,
      rateVndPerUsd: rate,
      markupVndPerMToken: markup,
      assumptions: {
        rawUnit: 'A6 micro-USD per 1M input tokens (public endpoint does not declare currency)',
        outputPrice: 'not returned by hot-models; no database price was changed',
      },
      models: modelRows,
      marketplaceItemCount: items.length,
    })
  } catch (error) {
    console.error('A6 marketplace pricing failed', error)
    return NextResponse.json({ error: 'a6_marketplace_pricing_failed' }, { status: 502 })
  }
}
