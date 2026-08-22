import Link from 'next/link'
import { CopyButton } from '@/components/CopyButton'
import { QuickConfig } from '@/components/QuickConfig'
import { requireUser } from '@/lib/auth'
import { formatNumber, formatVndFromMicros } from '@/lib/money'
import { formatVietnamDateTime } from '@/lib/date'

function vietnamDayStart() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}T00:00:00+07:00`
}

function statusLabel(status: string) {
  if (status === 'settled') return '200'
  if (status === 'released') return 'Failed'
  if (status === 'failed_ambiguous') return 'Review'
  return 'Pending'
}

export default async function DashboardPage() {
  const gatewayUrl = (process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech').replace(/\/+$/, '')
  const baseUrl = `${gatewayUrl}/v1`
  const { supabase, user } = await requireUser()
  const todayStart = vietnamDayStart()
  const [walletResult, todayResult, recentResult, keysResult, modelsResult, paidTopupsResult] = await Promise.all([
    supabase.from('wallets').select('available_micros').eq('user_id', user.id).single(),
    supabase.from('api_requests').select('retail_cost_micros,input_tokens,output_tokens').eq('user_id', user.id).gte('created_at', todayStart),
    supabase.from('api_requests').select('id,model_id,api_key_id,retail_cost_micros,input_tokens,output_tokens,status,created_at,started_at,completed_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6),
    supabase.from('api_keys').select('id,name,prefix,last_four,status').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('models').select('id,display_name').eq('status', 'active').order('display_name').limit(1),
    supabase.from('topups').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'paid'),
  ])
  const today = todayResult.data ?? []
  const keys = keysResult.data ?? []
  const recent = recentResult.data ?? []
  const activeKey = keys.find((key: any) => key.status === 'active')
  const spendToday = today.reduce((sum: bigint, request: any) => sum + BigInt(request.retail_cost_micros ?? 0), 0n)
  const tokensToday = today.reduce((sum: number, request: any) => sum + (request.input_tokens ?? 0) + (request.output_tokens ?? 0), 0)
  const onboardingComplete = Boolean(activeKey && recent.length > 0 && (paidTopupsResult.count ?? 0) > 0)
  const keyName = new Map(keys.map((key: any) => [key.id, key.name]))
  const preview = activeKey ? `${activeKey.prefix}-••••••••••••${activeKey.last_four || 'legacy'}` : null
  const model = modelsResult.data?.[0]?.id ?? 'kimi-k2.6'

  return <div className="page-stack">
    <header className="dashboard-head"><div><h1>Overview</h1><p className="muted">Key, Base URL, usage và số dư — mọi thứ cần để gọi API.</p></div><div className="dashboard-actions"><Link href="/dashboard/playground" className="btn">Test model</Link><Link href="/dashboard/api-keys" className="btn secondary">Manage API Keys</Link></div></header>
    <section className="kpi-grid" aria-label="Chỉ số hôm nay"><article className="surface kpi-card"><span>Số dư</span><strong>{formatVndFromMicros(walletResult.data?.available_micros ?? 0)}</strong></article><article className="surface kpi-card"><span>Chi hôm nay</span><strong>{formatVndFromMicros(spendToday)}</strong></article><article className="surface kpi-card"><span>Requests hôm nay</span><strong>{formatNumber(today.length)}</strong></article><article className="surface kpi-card"><span>Tokens hôm nay</span><strong>{formatNumber(tokensToday)}</strong></article></section>
    {!onboardingComplete && <section className="surface onboarding-card"><div className="onboarding-copy"><div className="eyebrow">Getting started</div><h2>Bắt đầu với APIVN</h2><p>Hoàn thành theo nhịp của bạn. Checklist không chặn các trang khác.</p></div><ol className="onboarding-list"><li className="done"><span>✓</span><strong>Tạo tài khoản</strong></li><li className={activeKey ? 'done' : ''}><span>{activeKey ? '✓' : '2'}</span><strong>Tạo API Key</strong><Link href="/dashboard/api-keys">{activeKey ? 'Manage' : 'Create'}</Link></li><li className={recent.length ? 'done' : ''}><span>{recent.length ? '✓' : '3'}</span><strong>Gửi request đầu tiên</strong><Link href="/dashboard/playground">Playground</Link></li><li className={(paidTopupsResult.count ?? 0) > 0 ? 'done' : ''}><span>{(paidTopupsResult.count ?? 0) > 0 ? '✓' : '4'}</span><strong>Nạp tiền</strong><Link href="/dashboard/billing">Billing</Link></li></ol></section>}
    <section className="surface quick-start-card"><div className="surface-head"><div><div className="eyebrow">Quick Start</div><h2>Thông tin kết nối</h2></div></div><div className="quick-start-grid"><div><span>Base URL</span><div className="credential-row"><code>{baseUrl}</code><CopyButton value={baseUrl} compact /></div></div><div><span>API Key</span>{preview ? <div className="credential-row"><code>{preview}</code><Link href="/dashboard/api-keys" className="btn secondary">Manage</Link></div> : <div className="empty-inline"><span>Chưa có API Key.</span><Link href="/dashboard/api-keys" className="btn">Create API Key</Link></div>}</div></div></section>
    <QuickConfig baseUrl={baseUrl} model={model} />
    <section className="surface model-table-shell"><div className="surface-head"><h2>Request gần đây</h2><Link href="/dashboard/usage">Xem Usage →</Link></div>{recent.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Time</th><th>Model</th><th>Status</th><th>Tokens</th><th>Cost</th><th>Key</th></tr></thead><tbody>{recent.map((request: any) => <tr key={request.id}><td>{formatVietnamDateTime(request.created_at)}</td><td><code>{request.model_id}</code></td><td><span className={`status-chip ${request.status === 'settled' ? 'success' : 'warning'}`}>{statusLabel(request.status)}</span></td><td>{formatNumber((request.input_tokens ?? 0) + (request.output_tokens ?? 0))}</td><td><strong>{formatVndFromMicros(request.retail_cost_micros ?? 0)}</strong></td><td>{request.api_key_id ? keyName.get(request.api_key_id) ?? 'Revoked key' : 'Playground'}</td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>Chưa có request nào</strong><p>Gửi request đầu tiên từ Playground hoặc API.</p><Link href="/dashboard/playground" className="btn">Mở Playground</Link></div>}</section>
  </div>
}
