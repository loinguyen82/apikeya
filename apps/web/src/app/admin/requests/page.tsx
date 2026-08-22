import { requireAdmin } from '@/lib/admin'
import { formatVndFromMicros } from '@/lib/money'
import { formatVietnamDateTime } from '@/lib/date'

export default async function AdminRequestsPage() {
  const { admin } = await requireAdmin()
  const { data: requests } = await admin
    .from('api_requests')
    .select('id,user_id,channel,model_id,status,provider_id,reserve_micros,retail_cost_micros,upstream_cost_micros,billing_gap_micros,error_code,created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = requests ?? []
  const requestIds = rows.map((row: any) => row.id)
  const { data: attempts } = requestIds.length
    ? await admin
        .from('provider_attempts')
        .select('api_request_id,provider_id,upstream_model,status,error_code,created_at')
        .in('api_request_id', requestIds)
        .order('created_at', { ascending: true })
    : { data: [] as any[] }

  const attemptsByRequest = new Map<string, any[]>()
  for (const attempt of attempts ?? []) {
    const current = attemptsByRequest.get(attempt.api_request_id) ?? []
    current.push(attempt)
    attemptsByRequest.set(attempt.api_request_id, current)
  }

  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Reconciliation</div><h1>Requests toàn hệ thống</h1><p>100 request gần nhất, gồm tiền reserve và attempt upstream để đối soát các trạng thái ambiguous.</p></div></header>
    <section className="surface model-table-shell">
      <div className="surface-head"><h3>Request log</h3><span className="status-chip">{rows.length} dòng</span></div>
      <div className="table-scroll"><table className="data-table">
        <thead><tr><th>ID</th><th>Kênh</th><th>Model</th><th>Provider attempts</th><th>Status</th><th>Reserve</th><th>Giá bán</th><th>Giá vốn</th><th>Margin</th><th>Gap</th><th>Error</th><th>Thời gian</th></tr></thead>
        <tbody>{rows.map((r:any)=>{
          const retail=BigInt(r.retail_cost_micros||0)
          const upstream=BigInt(r.upstream_cost_micros||0)
          const reserve=BigInt(r.reserve_micros||0)
          const gap=BigInt(r.billing_gap_micros||0)
          const margin=retail-upstream
          const requestAttempts=attemptsByRequest.get(r.id) ?? []
          return <tr key={r.id}>
            <td><code>{r.id.slice(0,8)}</code></td>
            <td>{r.channel}</td>
            <td><code>{r.model_id}</code></td>
            <td>{requestAttempts.length ? <div style={{display:'grid',gap:4}}>{requestAttempts.map((attempt:any,index:number)=><span key={`${attempt.provider_id}-${index}`} style={{fontSize:12}}><strong>{attempt.provider_id}</strong> · {attempt.status}{attempt.error_code ? ` · ${attempt.error_code}` : ''}</span>)}</div> : (r.provider_id??'-')}</td>
            <td><span className={`status-chip ${r.status==='settled'?'success':r.status==='failed_ambiguous'?'warning':r.status==='released'?'':'danger'}`}>{r.status}</span></td>
            <td>{formatVndFromMicros(reserve)}</td>
            <td>{formatVndFromMicros(retail)}</td>
            <td>{formatVndFromMicros(upstream)}</td>
            <td><strong style={{color:margin>=0n?'#08765f':'#b93636'}}>{formatVndFromMicros(margin)}</strong></td>
            <td>{gap > 0n ? <strong style={{color:'#b93636'}}>{formatVndFromMicros(gap)}</strong> : '-'}</td>
            <td>{r.error_code??'-'}</td>
            <td>{formatVietnamDateTime(r.created_at)}</td>
          </tr>
        })}</tbody>
      </table></div>
    </section>
  </div>
}
