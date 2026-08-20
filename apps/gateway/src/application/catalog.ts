import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModelCatalogItem, ProviderCandidate } from '@aiapi/contracts'

export interface RuntimeModel extends ModelCatalogItem {
  providers: ProviderCandidate[]
}

const modelAliases: Record<string, string> = {
  gpt: 'gpt-5.6-luna',
  luna: 'gpt-5.6-luna',
  terra: 'gpt-5.6-terra',
  sol: 'gpt-5.6-sol',
  sonnet: 'claude-sonnet-5',
  claude: 'claude-sonnet-5',
  kimi: 'kimi-k2.6',
  v4: 'deepseek-v4',
}

export function resolveModelAlias(modelId: string): string {
  return modelAliases[modelId.trim().toLowerCase()] ?? modelId
}

export async function loadRuntimeModel(
  db: SupabaseClient,
  modelId: string,
  envSecrets: Record<string, string>
): Promise<RuntimeModel> {
  const canonicalModelId = resolveModelAlias(modelId)
  const { data: model, error } = await db
    .from('models')
    .select(
      'id,display_name,description,tags,status,pricing_mode,retail_flat_micros_per_mtoken,retail_input_micros_per_mtoken,retail_output_micros_per_mtoken,default_max_output_tokens,max_output_tokens,streaming_enabled'
    )
    .eq('id', canonicalModelId)
    .maybeSingle()

  if (error || !model || model.status === 'disabled') {
    throw new Error('MODEL_NOT_AVAILABLE')
  }

  const { data: routes, error: routeError } = await db
    .from('provider_models')
    .select(
      'provider_id,upstream_model,priority,supports_stream_usage,upstream_input_micros_per_mtoken,upstream_output_micros_per_mtoken,providers!inner(base_url,api_key_secret_name,status,timeout_ms,safe_no_charge_statuses)'
    )
    .eq('model_id', canonicalModelId)
    .eq('enabled', true)
    .order('priority', { ascending: true })

  if (routeError) throw new Error(routeError.message)

  const providers: ProviderCandidate[] = (routes ?? []).flatMap((r: any) => {
    const p = r.providers
    if (!p || p.status === 'disabled') return []
    const apiKey = envSecrets[p.api_key_secret_name]
    if (!apiKey) return []
    return [
      {
        providerId: r.provider_id,
        baseUrl: p.base_url,
        apiKey,
        upstreamModel: r.upstream_model,
        timeoutMs: p.timeout_ms,
        priority: r.priority,
        supportsStreamUsage: r.supports_stream_usage,
        safeNoChargeStatuses: p.safe_no_charge_statuses ?? [],
        upstreamInputMicrosPerMToken: r.upstream_input_micros_per_mtoken,
        upstreamOutputMicrosPerMToken: r.upstream_output_micros_per_mtoken,
      },
    ]
  })

  return {
    id: model.id,
    displayName: model.display_name,
    description: model.description,
    tags: model.tags ?? [],
    status: model.status,
    pricingMode: model.pricing_mode,
    retailFlatMicrosPerMToken: model.retail_flat_micros_per_mtoken,
    retailInputMicrosPerMToken: model.retail_input_micros_per_mtoken,
    retailOutputMicrosPerMToken: model.retail_output_micros_per_mtoken,
    defaultMaxOutputTokens: model.default_max_output_tokens,
    maxOutputTokens: model.max_output_tokens,
    streamingEnabled: model.streaming_enabled,
    providers,
  }
}
