import { requireAdmin } from '@/lib/admin'
import { formatVndFromMicros } from '@/lib/money'

export default async function AdminModelsPage() {
  const { admin } = await requireAdmin()
  const [{ data: models }, { data: routes }] = await Promise.all([
    admin.from('models').select('id,display_name,status,pricing_mode,retail_flat_micros_per_mtoken,streaming_enabled').order('display_name'),
    admin.from('provider_models').select('provider_id,model_id,upstream_model,priority,enabled,supports_stream_usage,upstream_input_micros_per_mtoken,upstream_output_micros_per_mtoken').order('model_id'),
  ])
  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Routing</div><h1>Models & provider routes</h1><p>Kiểm tra model bán lẻ, trạng thái streaming, tuyến upstream và giá vốn đang áp dụng.</p></div></header>
    <section className="surface model-table-shell"><div className="surface-head"><h3>Model catalog</h3><span className="status-chip">{models?.length ?? 0} models</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Model</th><th>Trạng thái</th><th>Giá bán lẻ</th><th>Streaming</th></tr></thead><tbody>{(models ?? []).map((m:any)=><tr key={m.id}><td><strong>{m.display_name}</strong><br/><code>{m.id}</code></td><td><span className={`status-chip ${m.status==='active'?'success':'danger'}`}>{m.status}</span></td><td>{m.retail_flat_micros_per_mtoken?formatVndFromMicros(m.retail_flat_micros_per_mtoken):'Theo I/O'}</td><td>{m.streaming_enabled?'Có':'Không'}</td></tr>)}</tbody></table></div></section>
    <section className="surface model-table-shell"><div className="surface-head"><h3>Provider routes</h3><span className="status-chip">{routes?.length ?? 0} routes</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Public model</th><th>Provider</th><th>Upstream model</th><th>Priority</th><th>Giá vốn / 1M</th><th>Stream usage</th><th>Enabled</th></tr></thead><tbody>{(routes ?? []).map((r:any)=><tr key={`${r.provider_id}-${r.model_id}`}><td><code>{r.model_id}</code></td><td><strong>{r.provider_id}</strong></td><td><code>{r.upstream_model}</code></td><td>{r.priority}</td><td>{formatVndFromMicros(r.upstream_input_micros_per_mtoken)}</td><td>{r.supports_stream_usage?'Có':'Không'}</td><td><span className={`status-chip ${r.enabled?'success':''}`}>{r.enabled?'Bật':'Tắt'}</span></td></tr>)}</tbody></table></div></section>
  </div>
}
