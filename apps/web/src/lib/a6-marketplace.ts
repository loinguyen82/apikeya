export const A6_MARKETPLACE_HOT_MODELS_URL = 'https://a6api.com/api/marketplace/hot-models'
export const DEFAULT_A6_VND_PER_USD = 25_400
export const DEFAULT_A6_RETAIL_MARKUP_VND_PER_MTOKEN = 100

export type A6MarketplaceItem = {
  modelName: string
  brand: string | null
  chargeType: string | null
  minInputPriceMicros: string
  minPerRequestPriceMicros: string | null
  listingCount: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNonNegativeIntegerString(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  return value.trim()
}

function asNonNegativeInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value)
  return 0
}

/** Parse the public A6 hot-models response without trusting its shape. */
export function parseA6MarketplaceItems(payload: unknown): A6MarketplaceItem[] {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const rawItems = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(root?.items)
      ? root.items
      : []

  return rawItems.flatMap((raw) => {
    const item = asRecord(raw)
    const modelName = asText(item?.model_name)
    const minInputPriceMicros = asNonNegativeIntegerString(item?.min_input_price_micros)
    if (!modelName || minInputPriceMicros === null) return []
    return [{
      modelName,
      brand: asText(item?.brand),
      chargeType: asText(item?.charge_type),
      minInputPriceMicros,
      minPerRequestPriceMicros: asNonNegativeIntegerString(item?.min_per_request_price_micros),
      listingCount: asNonNegativeInteger(item?.listing_count),
    }]
  })
}

/**
 * A6 exposes the marketplace minimum as a `*_micros` value. We treat that
 * value as micro-USD per million tokens and make the USD/VND rate explicit,
 * because the public endpoint does not include a currency field.
 */
export function convertA6MarketplacePriceToVnd(
  minInputPriceMicros: string | number,
  vndPerUsd = DEFAULT_A6_VND_PER_USD,
): number {
  const raw = typeof minInputPriceMicros === 'number' ? minInputPriceMicros : Number(minInputPriceMicros)
  if (!Number.isFinite(raw) || raw < 0 || !Number.isFinite(vndPerUsd) || vndPerUsd < 0) return 0
  return Math.round((raw / 1_000_000) * vndPerUsd)
}

function normalizeModelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const A6_MODEL_ALIASES: Record<string, string[]> = {
  'kimi-k2.6': ['kimi-k2.6', 'kimi-k2'],
  'deepseek-v4': ['deepseek-v4-flash', 'DeepSeek-V4-Flash-0731', 'deepseek-v4-pro', 'deepseek-v4'],
  'claude-sonnet-5': ['claude-sonnet-5'],
  'gpt-5.6-terra': ['gpt-5.6-terra'],
  'gpt-5.6-luna': ['gpt-5.6-luna'],
  'gpt-5.6-sol': ['gpt-5.6-sol'],
}

export function findA6MarketplaceItem(
  modelId: string,
  items: A6MarketplaceItem[],
): A6MarketplaceItem | null {
  const aliases = A6_MODEL_ALIASES[modelId] ?? [modelId]
  const byName = new Map(items.map((item) => [normalizeModelName(item.modelName), item]))
  for (const alias of aliases) {
    const match = byName.get(normalizeModelName(alias))
    if (match) return match
  }
  return null
}
