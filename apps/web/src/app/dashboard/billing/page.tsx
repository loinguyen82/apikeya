import { requireUser } from '@/lib/auth'
import { isLiveBillingEnabled } from '@/lib/billing-mode'
import { isPayOSConfigured } from '@/lib/payos'
import { formatVietnamDateTime } from '@/lib/date'
import { formatVnd, formatVndFromMicros } from '@/lib/money'

const presets = [50_000, 100_000, 200_000, 500_000, 1_000_000]

function topupStatus(status: string) {
  if (status === 'paid') return ['success', 'Paid']
  if (status === 'pending') return ['warning', 'Pending']
  if (status === 'expired') return ['danger', 'Expired']
  return ['danger', status === 'cancelled' ? 'Failed' : status]
}

export default async function BillingPage() {
  const { supabase, user } = await requireUser()
  const billingReady = isLiveBillingEnabled() && isPayOSConfigured()
  const [{ data: wallet }, { data: topups }, { data: usage }, { data: ledger }] = await Promise.all([
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).single(),
    supabase.from('topups').select('id,payable_vnd,status,external_id,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(25),
    supabase.from('api_requests').select('id,retail_cost_micros,status,created_at').eq('user_id', user.id).eq('status', 'settled').order('created_at', { ascending: false }).limit(25),
    supabase.from('wallet_ledger').select('id,kind,delta_available_micros,reference_id,created_at').eq('user_id', user.id).in('kind', ['refund', 'manual_adjustment']).order('created_at', { ascending: false }).limit(25),
  ])
  const history = [
    ...(topups ?? []).map((item: any) => ({ id: `topup-${item.id}`, date: item.created_at, type: 'Top-up', amount: `${item.status === 'paid' ? '+' : ''}${formatVnd(item.payable_vnd)}`, status: topupStatus(item.status), reference: item.external_id || item.id.slice(0, 8).toUpperCase() })),
    ...(usage ?? []).map((item: any) => ({ id: `usage-${item.id}`, date: item.created_at, type: 'API usage', amount: `-${formatVndFromMicros(item.retail_cost_micros)}`, status: ['success', 'Paid'], reference: item.id.slice(0, 8).toUpperCase() })),
    ...(ledger ?? []).map((item: any) => ({ id: `ledger-${item.id}`, date: item.created_at, type: item.kind === 'refund' ? 'Refund' : 'Adjustment', amount: `${BigInt(item.delta_available_micros) >= 0n ? '+' : '-'}${formatVndFromMicros(BigInt(item.delta_available_micros) < 0n ? -BigInt(item.delta_available_micros) : item.delta_available_micros)}`, status: ['success', 'Paid'], reference: item.reference_id.slice(0, 8).toUpperCase() })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 30)

  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Billing</div><h1>Wallet và nạp tiền</h1><p>Billing là một phần của Developer Console. API Keys trong account dùng chung số dư này.</p></div><span className={`status-chip ${billingReady ? 'success' : 'warning'}`}>{billingReady ? 'PayOS live' : 'PayOS chưa cấu hình'}</span></header>
    {!billingReady && <div className="notice warning" role="status"><strong>Nạp tiền đang tạm khóa.</strong> Production không tạo QR giả hoặc giả lập giao dịch thành công. Cấu hình PayOS và đặt <code>BILLING_MODE=live</code> để mở thanh toán thật.</div>}
    <div className="billing-grid"><section className="surface wallet-card"><div className="eyebrow">Current Balance</div><div className="balance">{formatVndFromMicros(wallet?.available_micros ?? 0)}</div><div className="subtle-panel"><span className="muted" style={{ fontSize: 11 }}>Đang tạm giữ</span><strong style={{ display: 'block', marginTop: 4 }}>{formatVndFromMicros(wallet?.reserved_micros ?? 0)}</strong></div></section><section className="surface surface-pad"><div className="eyebrow">Top up</div><h2 style={{ margin: '5px 0 18px', fontSize: 20 }}>Chọn số tiền</h2><div className="amount-grid">{presets.map((amount) => <form key={amount} action="/api/topups" method="post"><input type="hidden" name="amount" value={amount} /><button className="amount-choice" type="submit" disabled={!billingReady}><strong>{formatVnd(amount)}</strong><small>VietQR / PayOS</small></button></form>)}</div><form action="/api/topups" method="post" className="custom-topup"><div className="field"><label htmlFor="custom-amount">Số tiền khác</label><input id="custom-amount" className="input" type="number" min="1000" step="1000" name="amount" placeholder="300000" disabled={!billingReady} /></div><button type="submit" className="btn" disabled={!billingReady}>Nạp tiền</button></form><p className="field-hint" style={{ marginTop: 12 }}>Chỉ webhook PayOS đã xác minh mới có quyền cộng wallet. Trạng thái đơn: Pending, Paid, Failed hoặc Expired.</p></section></div>
    <section className="surface model-table-shell"><div className="surface-head"><h2>Transaction history</h2><span className="status-chip">{history.length} giao dịch</span></div>{history.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{formatVietnamDateTime(item.date)}</td><td>{item.type}</td><td><strong>{item.amount}</strong></td><td><span className={`status-chip ${item.status[0]}`}>{item.status[1]}</span></td><td><code>{item.reference}</code></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>Chưa có giao dịch</strong><p>Top-up, API usage, refund và adjustment sẽ xuất hiện tại đây.</p></div>}</section>
  </div>
}
