import { requireUser } from '@/lib/auth'
import { QuotaTable, type QuotaRequestRow } from '@/components/QuotaTable'
import styles from './QuotaPage.module.css'

const allowedPageSizes = new Set([25, 50, 100])

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export default async function QuotaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>
}) {
  const { supabase, user } = await requireUser()
  const params = await searchParams
  const requestedSize = positiveInteger(params.pageSize, 100)
  const pageSize = allowedPageSizes.has(requestedSize) ? requestedSize : 100
  const requestedPage = positiveInteger(params.page, 1)

  const { count } = await supabase
    .from('api_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['settled', 'streaming', 'failed_ambiguous'])

  const total = count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, pageCount)
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1

  const { data: requests, error } = await supabase
    .from('api_requests')
    .select('id,created_at,model_id,requested_model_id,provider_id,status,stream,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_tokens,total_tokens,retail_cost_micros,started_at,first_token_at,completed_at')
    .eq('user_id', user.id)
    .in('status', ['settled', 'streaming', 'failed_ambiguous'])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, end)

  const modelIds = [...new Set((requests ?? []).map((request: any) => request.model_id))]
  const { data: models } = modelIds.length > 0
    ? await supabase.from('models').select('id,display_name').in('id', modelIds)
    : { data: [] as Array<{ id: string; display_name: string }> }
  const modelNames = new Map((models ?? []).map((model: any) => [model.id, model.display_name]))

  const rows: QuotaRequestRow[] = (requests ?? []).map((request: any) => ({
    id: request.id,
    createdAt: request.created_at,
    modelId: request.model_id,
    modelDisplayName: modelNames.get(request.model_id) ?? null,
    requestedModelId: request.requested_model_id ?? null,
    providerId: request.provider_id ?? null,
    status: request.status,
    stream: request.stream === true,
    inputTokens: request.input_tokens ?? null,
    cachedInputTokens: request.cached_input_tokens ?? null,
    cacheCreationInputTokens: request.cache_creation_input_tokens ?? null,
    outputTokens: request.output_tokens ?? null,
    reasoningTokens: request.reasoning_tokens ?? null,
    totalTokens: request.total_tokens ?? null,
    retailCostMicros: request.retail_cost_micros ?? null,
    startedAt: request.started_at ?? null,
    firstTokenAt: request.first_token_at ?? null,
    completedAt: request.completed_at ?? null,
  }))

  return (
    <div className={`${styles.page} stack`}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">REQUEST USAGE</span>
          <h1>Quota</h1>
          <p className="muted">Lịch sử request theo thời gian thực. Rate được chuẩn hóa từ chi phí thực tế của từng request về mức / 1M token để dễ so sánh.</p>
        </div>
      </div>

      <section className={styles.panel} aria-label="API request usage">
        {error ? (
          <p className="quota-error">Unable to load request usage. Apply the latest database migration, then try again.</p>
        ) : (
          <QuotaTable rows={rows} total={total} page={page} pageSize={pageSize} />
        )}
      </section>
    </div>
  )
}
