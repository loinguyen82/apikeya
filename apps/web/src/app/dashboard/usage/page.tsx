import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatNumber, formatVndFromMicros } from '@/lib/money'
import { formatVietnamDateTime } from '@/lib/date'

const PAGE_SIZE = 15
const validStatuses = new Set(['settled', 'released', 'failed_ambiguous', 'reserved', 'dispatching', 'streaming'])

function latency(started: string | null, completed: string | null) {
  if (!started || !completed) return '—'
  const ms = Date.parse(completed) - Date.parse(started)
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.max(0, ms)}ms`
}

function statusView(status: string) {
  if (status === 'settled') return ['success', '200']
  if (status === 'released') return ['danger', 'Failed']
  if (status === 'failed_ambiguous') return ['warning', 'Review']
  return ['warning', 'Pending']
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ page?: string; date?: string; model?: string; key?: string; status?: string }> }) {
  const { supabase, user } = await requireUser()
  const params = await searchParams
  const pageNumber = Number(params.page ?? 1)
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1
  const from = (page - 1) * PAGE_SIZE
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : ''
  const modelFilter = params.model?.slice(0, 100) ?? ''
  const keyFilter = params.key?.slice(0, 80) ?? ''
  const statusFilter = validStatuses.has(params.status ?? '') ? params.status! : ''
  const [{ data: models }, { data: keys }] = await Promise.all([
    supabase.from('models').select('id,display_name').neq('status', 'disabled').order('display_name'),
    supabase.from('api_keys').select('id,name').eq('user_id', user.id).order('name'),
  ])
  let query = supabase.from('api_requests').select('id,api_key_id,model_id,status,input_tokens,output_tokens,retail_cost_micros,created_at,started_at,completed_at', { count: 'exact' }).eq('user_id', user.id)
  let chartQuery = supabase.from('api_requests').select('retail_cost_micros,created_at').eq('user_id', user.id)
  if (date) { query = query.gte('created_at', `${date}T00:00:00+07:00`).lt('created_at', `${date}T23:59:59.999+07:00`); chartQuery = chartQuery.gte('created_at', `${date}T00:00:00+07:00`).lt('created_at', `${date}T23:59:59.999+07:00`) }
  if (modelFilter) { query = query.eq('model_id', modelFilter); chartQuery = chartQuery.eq('model_id', modelFilter) }
  if (keyFilter === 'playground') { query = query.is('api_key_id', null); chartQuery = chartQuery.is('api_key_id', null) }
  else if (keyFilter) { query = query.eq('api_key_id', keyFilter); chartQuery = chartQuery.eq('api_key_id', keyFilter) }
  if (statusFilter) { query = query.eq('status', statusFilter); chartQuery = chartQuery.eq('status', statusFilter) }
  const [{ data: requests, count }, { data: chartRows }] = await Promise.all([
    query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1),
    chartQuery.order('created_at', { ascending: true }).limit(500),
  ])
  const rows = requests ?? []
  const totalRows = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const keyNames = new Map((keys ?? []).map((key: any) => [key.id, key.name]))
  const days = new Map<string, { requests: number; spend: bigint }>()
  for (const request of chartRows ?? []) {
    const day = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(new Date(request.created_at))
    const current = days.get(day) ?? { requests: 0, spend: 0n }
    current.requests += 1
    current.spend += BigInt(request.retail_cost_micros ?? 0)
    days.set(day, current)
  }
  const chart = [...days.entries()].slice(-14)
  const maxRequests = Math.max(1, ...chart.map(([, value]) => value.requests))
  const totalSpend = (chartRows ?? []).reduce((sum: bigint, request: any) => sum + BigInt(request.retail_cost_micros ?? 0), 0n)
  const buildPageHref = (nextPage: number) => {
    const queryParams = new URLSearchParams()
    queryParams.set('page', String(nextPage))
    if (date) queryParams.set('date', date)
    if (modelFilter) queryParams.set('model', modelFilter)
    if (keyFilter) queryParams.set('key', keyFilter)
    if (statusFilter) queryParams.set('status', statusFilter)
    return `/dashboard/usage?${queryParams}`
  }

  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Usage</div><h1>Requests và cost</h1><p>Lọc theo ngày, model, API Key hoặc trạng thái. Playground được ghi chung vào usage của account.</p></div></header>
    <form className="surface usage-filters"><div className="field"><label htmlFor="usage-date">Date</label><input id="usage-date" className="input" type="date" name="date" defaultValue={date} /></div><div className="field"><label htmlFor="usage-model">Model</label><select id="usage-model" className="input" name="model" defaultValue={modelFilter}><option value="">Tất cả</option>{(models ?? []).map((model: any) => <option key={model.id} value={model.id}>{model.display_name}</option>)}</select></div><div className="field"><label htmlFor="usage-key">API Key</label><select id="usage-key" className="input" name="key" defaultValue={keyFilter}><option value="">Tất cả</option><option value="playground">Playground</option>{(keys ?? []).map((key: any) => <option key={key.id} value={key.id}>{key.name}</option>)}</select></div><div className="field"><label htmlFor="usage-status">Status</label><select id="usage-status" className="input" name="status" defaultValue={statusFilter}><option value="">Tất cả</option><option value="settled">200 / Settled</option><option value="released">Failed / Released</option><option value="failed_ambiguous">Review</option><option value="reserved">Pending</option></select></div><button className="btn" type="submit">Apply filters</button><Link href="/dashboard/usage" className="btn secondary">Reset</Link></form>
    <div className="usage-summary"><div className="surface mini-stat"><span>Requests</span><strong>{formatNumber(totalRows)}</strong></div><div className="surface mini-stat"><span>Spend</span><strong>{formatVndFromMicros(totalSpend)}</strong></div><div className="surface mini-stat"><span>Active filters</span><strong>{[date, modelFilter, keyFilter, statusFilter].filter(Boolean).length}</strong></div></div>
    <section className="surface usage-chart"><div className="surface-head"><div><div className="eyebrow">Trend</div><h2>Requests over time</h2></div><span className="muted">Spend: {formatVndFromMicros(totalSpend)}</span></div>{chart.length ? <div className="chart-bars" aria-label="Requests over time">{chart.map(([day, value]) => <div className="chart-bar" key={day} title={`${day}: ${value.requests} requests · ${formatVndFromMicros(value.spend)}`}><span style={{ height: `${Math.max(8, (value.requests / maxRequests) * 100)}%` }} /><small>{day}</small></div>)}</div> : <div className="empty-state"><strong>Chưa có dữ liệu chart</strong><p>Gửi request đầu tiên để theo dõi spend và requests.</p></div>}</section>
    <section className="surface model-table-shell"><div className="surface-head"><h2>Request history</h2><span className="status-chip">Trang {page} / {totalPages}</span></div>{rows.length ? <><div className="table-scroll"><table className="data-table"><thead><tr><th>Time</th><th>Model</th><th>Status</th><th>Input</th><th>Output</th><th>Cost</th><th>Latency</th><th>Key</th></tr></thead><tbody>{rows.map((request: any) => { const state = statusView(request.status); return <tr key={request.id}><td>{formatVietnamDateTime(request.created_at)}</td><td><code>{request.model_id}</code></td><td><span className={`status-chip ${state[0]}`}>{state[1]}</span></td><td>{formatNumber(request.input_tokens ?? 0)}</td><td>{formatNumber(request.output_tokens ?? 0)}</td><td><strong>{formatVndFromMicros(request.retail_cost_micros ?? 0)}</strong></td><td>{latency(request.started_at, request.completed_at)}</td><td>{request.api_key_id ? keyNames.get(request.api_key_id) ?? 'Revoked key' : 'Playground'}</td></tr> })}</tbody></table></div><nav className="pagination" aria-label="Phân trang Usage">{page > 1 ? <Link href={buildPageHref(page - 1)} className="btn secondary">← Trang trước</Link> : <span />}<span>{formatNumber(from + 1)}–{formatNumber(Math.min(from + rows.length, totalRows))} / {formatNumber(totalRows)}</span>{page < totalPages ? <Link href={buildPageHref(page + 1)} className="btn secondary">Trang sau →</Link> : <span />}</nav></> : <div className="surface-body"><div className="empty-card"><div className="empty-icon">R</div><strong>Chưa có request nào</strong><p>Gửi request đầu tiên từ Playground hoặc API.</p><Link href="/dashboard/playground" className="btn">Mở Playground</Link></div></div>}</section>
  </div>
}
