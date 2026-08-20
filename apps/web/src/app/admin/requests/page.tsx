import { requireAdmin } from '@/lib/admin'
import { formatVndFromMicros } from '@/lib/money'
import { formatVietnamDateTime } from '@/lib/date'

export default async function AdminRequestsPage() {
  const { admin } = await requireAdmin()
  const { data: requests } = await admin.from('api_requests').select('id,user_id,channel,model_id,status,provider_id,retail_cost_micros,upstream_cost_micros,billing_gap_micros,error_code,created_at').order('created_at', { ascending: false }).limit(100)
  const rows = requests ?? []
  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Reconciliation</div><h1>Requests toàn hệ thống</h1><p>100 request gần nhất để kiểm tra trạng thái, chi phí upstream và gross margin.</p></div></header>
    <section className="surface model-table-shell"><div className="surface-head"><h3>Request log</h3><span className="status-chip">{rows.length} dòng</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>Kênh</th><th>Model</th><th>Provider</th><th>Status</th><th>Giá bán</th><th>Giá vốn</th><th>Margin</th><th>Error</th><th>Thời gian</th></tr></thead><tbody>{rows.map((r:any)=>{const retail=BigInt(r.retail_cost_micros||0);const upstream=BigInt(r.upstream_cost_micros||0);const margin=retail-upstream;return <tr key={r.id}><td><code>{r.id.slice(0,8)}</code></td><td>{r.channel}</td><td><code>{r.model_id}</code></td><td>{r.provider_id??'-'}</td><td><span className={`status-chip ${r.status==='settled'?'success':r.status==='failed_ambiguous'?'warning':r.status==='released'?'':'danger'}`}>{r.status}</span></td><td>{formatVndFromMicros(retail)}</td><td>{formatVndFromMicros(upstream)}</td><td><strong style={{color:margin>=0n?'#08765f':'#b93636'}}>{formatVndFromMicros(margin)}</strong></td><td>{r.error_code??'-'}</td><td>{formatVietnamDateTime(r.created_at)}</td></tr>})}</tbody></table></div></section>
  </div>
}
