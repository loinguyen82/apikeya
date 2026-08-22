import type { ChatCompletionRequest, ProviderFailure } from '@aiapi/contracts'
import type { Env } from '../env.js'
import { resolveModelAlias } from '../application/catalog.js'
import { OpenAICompatibleAdapter } from '../providers/openai-compatible.js'
import { adminDb } from '../repositories/supabase.js'

export type HealthStatus = 'unknown' | 'live' | 'degraded' | 'dead'
type ReportOutcome = 'ok' | 'slow' | 'http_error'

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

export type RouteResult = {
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

export type ModelSummary = {
  modelId: string
  status: HealthStatus
  latencyMs: number | null
  providers: RouteResult[]
}

const HEALTH_TIMEOUT_MS = 40_000
const SLOW_THRESHOLD_MS = 40_000
const DEAD_AFTER_FAILURES = 3
const TELEGRAM_WEBHOOK_URL = 'https://api.apivn.tech/internal/telegram/model-health'
const REPORT_BASE_URL = 'https://api.apivn.tech/v1'
const TELEGRAM_SAFE_MESSAGE_LENGTH = 3_800

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

function pickReportProvider(summary: ModelSummary): RouteResult | null {
  if (summary.providers.length === 0) return null
  const live = summary.providers
    .filter((provider) => provider.status === 'live')
    .sort((a, b) => a.latencyMs - b.latencyMs)[0]
  if (live) return live

  const unresolved = summary.providers.find((provider) =>
    provider.httpStatus == null && (
      provider.errorCode === 'UPSTREAM_TIMEOUT' ||
      provider.errorCode === 'UPSTREAM_NETWORK' ||
      provider.status === 'unknown'
    )
  )
  return unresolved ?? summary.providers[0]
}

function reportOutcome(summary: ModelSummary): ReportOutcome {
  const provider = pickReportProvider(summary)
  if (!provider) return 'slow'
  if (provider.status === 'live' && provider.httpStatus != null && provider.httpStatus >= 200 && provider.httpStatus < 300) {
    return provider.latencyMs >= SLOW_THRESHOLD_MS ? 'slow' : 'ok'
  }
  if (
    provider.httpStatus == null &&
    (provider.errorCode === 'UPSTREAM_TIMEOUT' || provider.errorCode === 'UPSTREAM_NETWORK' || provider.status === 'unknown')
  ) {
    return 'slow'
  }
  return 'http_error'
}

function formatReportLine(summary: ModelSummary): string {
  const provider = pickReportProvider(summary)
  const latencyMs = provider?.latencyMs ?? summary.latencyMs ?? 0
  const http = provider?.httpStatus == null ? 'ERR' : String(provider.httpStatus)
  const outcome = reportOutcome(summary)

  if (outcome === 'ok') {
    return `✅ ${summary.modelId}: OK · HTTP ${http} · ${latencyMs}ms`
  }
  if (outcome === 'slow') {
    const slowLabel = latencyMs >= SLOW_THRESHOLD_MS || provider?.errorCode === 'UPSTREAM_TIMEOUT'
      ? 'CHẬM >40s'
      : 'CHƯA KẾT LUẬN'
    return `🟡 ${summary.modelId}: ${slowLabel} · HTTP ${http} · ${latencyMs}ms`
  }
  return `❌ ${summary.modelId}: LỖI · HTTP ${http} · ${latencyMs}ms`
}

export function formatModelHealthReport(
  summaries: ModelSummary[],
  title = 'APIVN model health check',
): string {
  const ok = summaries.filter((item) => reportOutcome(item) === 'ok').length
  const slow = summaries.filter((item) => reportOutcome(item) === 'slow').length
  const httpErrors = summaries.filter((item) => reportOutcome(item) === 'http_error').length
  const lines = [
    `🔎 ${title}`,
    `Base: ${REPORT_BASE_URL}`,
    `Tổng: ${summaries.length} · OK: ${ok} · Chậm/chưa kết luận: ${slow} · Lỗi HTTP: ${httpErrors}`,
    '',
    ...summaries.map(formatReportLine),
    '',
    `Checked: ${formatCheckedAt()}`,
  ]
  return lines.join('\n')
}

function splitTelegramText(text: string): string[] {
  if (text.length <= TELEGRAM_SAFE_MESSAGE_LENGTH) return [text]
  const chunks: string[] = []
  let current = ''
  for (const line of text.split('\n')) {
    const next = current ? `${current}\n${line}` : line
    if (next.length > TELEGRAM_SAFE_MESSAGE_LENGTH && current) {
      chunks.push(current)
      current = line
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export async function sendTelegramMessage(env: Env, chatId: string, text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false
  let allSent = true
  for (const chunk of splitTelegramText(text)) {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    })
    if (!response.ok) {
      allSent = false
      console.error('telegram sendMessage failed', response.status, (await response.text()).slice(0, 300))
    }
  }
  return allSent
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
    const provider = pickReportProvider(summary)
    const http = provider?.httpStatus == null ? 'ERR' : String(provider.httpStatus)
    const latency = provider?.latencyMs ?? summary.latencyMs ?? 0
    lines.push(`${statusEmoji(summary.status)} ${summary.modelId}: ${previous.toUpperCase()} → ${summary.status.toUpperCase()} · HTTP ${http} · ${latency}ms`)
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
  return {
    summaries,
    text: formatModelHealthReport(summaries, options.modelId ? 'APIVN model health check' : 'APIVN model health check'),
  }
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
  const filtered = onlyProblems ? summaries.filter((item) => reportOutcome(item) !== 'ok') : summaries
  if (onlyProblems && filtered.length === 0) return '✅ Không có model chậm hoặc lỗi HTTP.'
  return formatModelHealthReport(filtered, onlyProblems ? 'APIVN model problems' : 'APIVN model health check')
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
      '/status — xem report gần nhất',
      '/dead — chỉ model chậm/lỗi',
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
    await sendTelegramMessage(env, incomingChatId, `⏳ Đang test ${modelId ? resolveModelAlias(modelId) : 'tất cả model'}…`)
    waitUntil(
      runModelHealthScan(env, { modelId, notifyChanges: false })
        .then((result) => sendTelegramMessage(env, incomingChatId, result.text))
        .catch((error) => sendTelegramMessage(env, incomingChatId, `❌ Health test failed: ${error instanceof Error ? error.message : 'unknown error'}`))
    )
    return
  }

  await sendTelegramMessage(env, incomingChatId, 'Không rõ lệnh. Dùng /help.')
}