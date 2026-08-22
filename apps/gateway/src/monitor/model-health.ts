import type { ChatCompletionRequest, ProviderFailure } from '@aiapi/contracts'
import type { Env } from '../env.js'
import { resolveModelAlias } from '../application/catalog.js'
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.js'
import { adminDb } from '../repositories/supabase.js'

export type HealthStatus = 'unknown' | 'live' | 'degraded' | 'dead'

type ProviderInfo = {
  base_url: string
  api_key_secret_name: string
  status: string
  timeout_ms: number
  safe_no_charge_statuses: number[] | null
}

type RouteRow = {
  provider_id: string
  model_id: string
  upstream_model: string
  enabled: boolean
  health_status: HealthStatus | null
  health_consecutive_failures: number | null
  health_latency_ms: number | null
  health_http_status: number | null
  health_error_code: string | null
  health_last_checked_at: string | null
  providers: ProviderInfo
}

type RouteResult = {
  providerId: string
  modelId: string
  previousStatus: HealthStatus
  status: HealthStatus
  consecutiveFailures: number
  latencyMs: number
  httpStatus: number | null
  errorCode: string | null
  errorMessage: string | null
}

type ModelSummary = {
  modelId: string
  status: HealthStatus
  latencyMs: number | null
  providers: RouteResult[]
}

const HEALTH_TIMEOUT_MS = 20_000
const DEAD_AFTER_FAILURES = 3
const TELEGRAM_WEBHOOK_URL = 'https://api.apivn.tech/internal/telegram/model-health'

const probeBody: ChatCompletionRequest = {
  model: 'health-probe',
  messages: [{ role: 'user', content: 'OK' }],
  stream: false,
  max_tokens: 1,
}

function envSecret(env: Env, name: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[name]
}

function normalizeStatus(value: unknown): HealthStatus {
  return value === 'live' || value === 'degraded' || value === 'dead' ? value : 'unknown'
}

function failureStatus(previousFailures: number, failure: ProviderFailure | { httpStatus?: number; code: string }): {
  status: HealthStatus
  consecutiveFailures: number
} {
  const consecutiveFailures = previousFailures + 1
  const httpStatus = failure.httpStatus ?? null
  const hardFailure = httpStatus === 401 || httpStatus === 403 || httpStatus === 404 || failure.code === 'MISSING_PROVIDER_SECRET'

  // 429 proves the route/model is reachable but temporarily capacity-limited.
  if (httpStatus === 429) return { status: 'degraded', consecutiveFailures }
  if (hardFailure || consecutiveFailures >= DEAD_AFTER_FAILURES) return { status: 'dead', consecutiveFailures }
  return { status: 'degraded', consecutiveFailures }
}

async function probeRoute(env: Env, route: RouteRow): Promise<RouteResult> {
  const startedAt = Date.now()
  const previousStatus = normalizeStatus(route.health_status)
  const previousFailures = Math.max(0, route.health_consecutive_failures ?? 0)
  const provider = route.providers
  const apiKey = envSecret(env, provider.api_key_secret_name)

  if (!apiKey) {
    const next = failureStatus(previousFailures, { code: 'MISSING_PROVIDER_SECRET' })
    return {
      providerId: route.provider_id,
      modelId: route.model_id,
      previousStatus,
      status: next.status,
      consecutiveFailures: next.consecutiveFailures,
      latencyMs: Date.now() - startedAt,
      httpStatus: null,
      errorCode: 'MISSING_PROVIDER_SECRET',
      errorMessage: `Worker secret ${provider.api_key_secret_name} is missing`,
    }
  }

  const adapter = new OpenAICompatibleAdapter(route.provider_id)
  const result = await adapter.invokeChat({
    baseUrl: provider.base_url,
    apiKey,
    upstreamModel: route.upstream_model,
    body: probeBody,
    outputCap: 1,
    timeoutMs: Math.max(1_000, Math.min(provider.timeout_ms || HEALTH_TIMEOUT_MS, HEALTH_TIMEOUT_MS)),
    safeNoChargeStatuses: provider.safe_no_charge_statuses ?? [],
  })
  const latencyMs = Date.now() - startedAt

  if ('kind' in result) {
    return {
      providerId: route.provider_id,
      modelId: route.model_id,
      previousStatus,
      status: 'live',
      consecutiveFailures: 0,
      latencyMs,
      httpStatus: result.response.status,
      errorCode: null,
      errorMessage: null,
    }
  }

  const next = failureStatus(previousFailures, result)
  return {
    providerId: route.provider_id,
    modelId: route.model_id,
    previousStatus,
    status: next.status,
    consecutiveFailures: next.consecutiveFailures,
    latencyMs,
    httpStatus: result.httpStatus ?? null,
    errorCode: result.code,
    errorMessage: result.message.slice(0, 220),
  }
}

function aggregateStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.some((status) => status === 'live')) return 'live'
  if (statuses.some((status) => status === 'degraded' || status === 'unknown')) return 'degraded'
  return statuses.length > 0 ? 'dead' : 'unknown'
}

function aggregateResults(results: RouteResult[]): ModelSummary[] {
  const grouped = new Map<string, RouteResult[]>()
  for (const result of results) {
    const group = grouped.get(result.modelId) ?? []
    group.push(result)
    grouped.set(result.modelId, group)
  }

  return [...grouped.entries()]
    .map(([modelId, providers]) => {
      const liveLatencies = providers.filter((item) => item.status === 'live').map((item) => item.latencyMs)
      return {
        modelId,
        status: aggregateStatus(providers.map((item) => item.status)),
        latencyMs: liveLatencies.length > 0 ? Math.min(...liveLatencies) : providers[0]?.latencyMs ?? null,
        providers,
      }
    })
    .sort((a, b) => a.modelId.localeCompare(b.modelId))
}

async function loadRoutes(env: Env, modelId?: string): Promise<RouteRow[]> {
  const db = adminDb(env)
  let query = db
    .from('provider_models')
    .select('provider_id,model_id,upstream_model,enabled,health_status,health_consecutive_failures,health_latency_ms,health_http_status,health_error_code,health_last_checked_at,providers!inner(base_url,api_key_secret_name,status,timeout_ms,safe_no_charge_statuses)')
    .eq('enabled', true)

  if (modelId) query = query.eq('model_id', resolveModelAlias(modelId))

  const { data, error } = await query.order('model_id').order('priority')
  if (error) throw new Error(`MODEL_HEALTH_LOAD_FAILED: ${error.message}`)

  return (data ?? []).flatMap((row: any) => {
    if (!row.providers || row.providers.status === 'disabled') return []
    return [row as RouteRow]
  })
}

async function persistResult(env: Env, result: RouteResult): Promise<void> {
  const db = adminDb(env)
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    health_status: result.status,
    health_consecutive_failures: result.consecutiveFailures,
    health_last_checked_at: now,
    health_latency_ms: result.latencyMs,
    health_http_status: result.httpStatus,
    health_error_code: result.errorCode,
    health_error_message: result.errorMessage,
  }
  if (result.status === 'live') patch.health_last_success_at = now
  if (result.status !== result.previousStatus) patch.health_changed_at = now

  const { error } = await db
    .from('provider_models')
    .update(patch)
    .eq('provider_id', result.providerId)
    .eq('model_id', result.modelId)
  if (error) throw new Error(`MODEL_HEALTH_SAVE_FAILED: ${error.message}`)
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      output[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return output
}

function previousModelStatuses(routes: RouteRow[]): Map<string, HealthStatus> {
  const grouped = new Map<string, HealthStatus[]>()
  for (const route of routes) {
    const group = grouped.get(route.model_id) ?? []
    group.push(normalizeStatus(route.health_status))
    grouped.set(route.model_id, group)
  }
  return new Map([...grouped.entries()].map(([modelId, statuses]) => [modelId, aggregateStatus(statuses)]))
}

function statusEmoji(status: HealthStatus): string {
  if (status === 'live') return '🟢'
  if (status === 'degraded') return '🟡'
  if (status === 'dead') return '🔴'
  return '⚪'
}

function formatCheckedAt(date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

function formatSummaries(summaries: ModelSummary[], title = 'APIVN Model Health'): string {
  const live = summaries.filter((item) => item.status === 'live').length
  const degraded = summaries.filter((item) => item.status === 'degraded').length
  const dead = summaries.filter((item) => item.status === 'dead').length
  const lines = [
    `🤖 ${title}`,
    `${live}/${summaries.length} LIVE · ${degraded} DEGRADED · ${dead} DEAD`,
    '',
  ]

  for (const summary of summaries) {
    const latency = summary.latencyMs == null ? '' : ` · ${summary.latencyMs}ms`
    const problem = summary.providers.find((provider) => provider.status !== 'live')
    const reason = summary.status === 'live' || !problem
      ? ''
      : ` · ${problem.providerId}: ${problem.errorCode ?? problem.httpStatus ?? 'error'} #${problem.consecutiveFailures}`
    lines.push(`${statusEmoji(summary.status)} ${summary.modelId}${latency}${reason}`)
  }
  lines.push('', `Checked ${formatCheckedAt()}`)
  return lines.join('\n')
}

export async function sendTelegramMessage(env: Env, chatId: string, text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  if (!response.ok) {
    console.error('telegram sendMessage failed', response.status, (await response.text()).slice(0, 300))
    return false
  }
  return true
}

async function notifyModelTransitions(
  env: Env,
  before: Map<string, HealthStatus>,
  after: ModelSummary[],
): Promise<void> {
  if (!env.TELEGRAM_CHAT_ID || !env.TELEGRAM_BOT_TOKEN) return
  const transitions = after.filter((summary) => {
    const previous = before.get(summary.modelId) ?? 'unknown'
    if (previous === summary.status) return false
    if (previous === 'unknown' && summary.status === 'live') return false
    return true
  })
  if (transitions.length === 0) return

  const lines = ['🚨 APIVN model state changed', '']
  for (const summary of transitions) {
    const previous = before.get(summary.modelId) ?? 'unknown'
    const problem = summary.providers.find((provider) => provider.status !== 'live')
    const detail = summary.status === 'live'
      ? summary.latencyMs == null ? '' : ` · ${summary.latencyMs}ms`
      : ` · ${problem?.errorCode ?? problem?.httpStatus ?? 'error'}`
    lines.push(`${statusEmoji(summary.status)} ${summary.modelId}: ${previous.toUpperCase()} → ${summary.status.toUpperCase()}${detail}`)
  }
  await sendTelegramMessage(env, env.TELEGRAM_CHAT_ID, lines.join('\n'))
}

export async function runModelHealthScan(
  env: Env,
  options: { modelId?: string; notifyChanges?: boolean } = {},
): Promise<{ summaries: ModelSummary[]; text: string }> {
  const routes = await loadRoutes(env, options.modelId)
  if (routes.length === 0) {
    const label = options.modelId ? resolveModelAlias(options.modelId) : 'enabled models'
    return { summaries: [], text: `⚪ No provider route found for ${label}.` }
  }

  const before = previousModelStatuses(routes)
  const results = await mapLimit(routes, 3, async (route) => {
    const result = await probeRoute(env, route)
    await persistResult(env, result)
    return result
  })
  const summaries = aggregateResults(results)
  if (options.notifyChanges !== false) await notifyModelTransitions(env, before, summaries)
  return { summaries, text: formatSummaries(summaries, options.modelId ? 'Model health test' : 'APIVN Model Health') }
}

export async function readModelHealthStatus(env: Env, onlyProblems = false): Promise<string> {
  const routes = await loadRoutes(env)
  const results: RouteResult[] = routes.map((route) => ({
    providerId: route.provider_id,
    modelId: route.model_id,
    previousStatus: normalizeStatus(route.health_status),
    status: normalizeStatus(route.health_status),
    consecutiveFailures: Math.max(0, route.health_consecutive_failures ?? 0),
    latencyMs: route.health_latency_ms ?? 0,
    httpStatus: route.health_http_status,
    errorCode: route.health_error_code,
    errorMessage: null,
  }))
  const summaries = aggregateResults(results)
  const filtered = onlyProblems ? summaries.filter((item) => item.status !== 'live') : summaries
  if (onlyProblems && filtered.length === 0) return '✅ Không có model DEGRADED/DEAD.'
  return formatSummaries(filtered, onlyProblems ? 'APIVN problems' : 'APIVN Model Health')
}

export async function ensureTelegramWebhook(env: Env): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return
  try {
    const infoResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`)
    const info = infoResponse.ok ? await infoResponse.json() as any : null
    if (info?.result?.url === TELEGRAM_WEBHOOK_URL) return

    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: TELEGRAM_WEBHOOK_URL,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message'],
      }),
    })
    if (!response.ok) console.error('telegram setWebhook failed', response.status, (await response.text()).slice(0, 300))
  } catch (error) {
    console.error('telegram webhook setup failed', error)
  }
}

export async function handleTelegramUpdate(
  env: Env,
  update: any,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<void> {
  const message = update?.message
  const text = typeof message?.text === 'string' ? message.text.trim() : ''
  const incomingChatId = message?.chat?.id == null ? '' : String(message.chat.id)
  if (!incomingChatId || !text.startsWith('/')) return

  const [rawCommand, ...args] = text.split(/\s+/)
  const command = rawCommand.split('@')[0].toLowerCase()

  if (!env.TELEGRAM_CHAT_ID) {
    await sendTelegramMessage(
      env,
      incomingChatId,
      `🤖 APIVN Model Health bot\nChat ID của bạn: ${incomingChatId}\nSet Worker secret TELEGRAM_CHAT_ID=${incomingChatId} để khóa bot vào chat này.`
    )
    return
  }
  if (incomingChatId !== env.TELEGRAM_CHAT_ID) return

  if (command === '/start' || command === '/help') {
    await sendTelegramMessage(env, incomingChatId, [
      '🤖 APIVN Model Health',
      '/status — trạng thái tất cả model',
      '/dead — chỉ model lỗi',
      '/test — test ngay tất cả model',
      '/test <model> — test một model, ví dụ /test sol',
    ].join('\n'))
    return
  }

  if (command === '/status') {
    await sendTelegramMessage(env, incomingChatId, await readModelHealthStatus(env))
    return
  }

  if (command === '/dead') {
    await sendTelegramMessage(env, incomingChatId, await readModelHealthStatus(env, true))
    return
  }

  if (command === '/test') {
    const modelId = args.join(' ').trim() || undefined
    await sendTelegramMessage(env, incomingChatId, `⏳ Testing ${modelId ? resolveModelAlias(modelId) : 'all enabled models'}…`)
    waitUntil(
      runModelHealthScan(env, { modelId, notifyChanges: false })
        .then((result) => sendTelegramMessage(env, incomingChatId, result.text))
        .catch((error) => sendTelegramMessage(env, incomingChatId, `❌ Health test failed: ${error instanceof Error ? error.message : 'unknown error'}`))
    )
    return
  }

  await sendTelegramMessage(env, incomingChatId, 'Không rõ lệnh. Dùng /help.')
}
