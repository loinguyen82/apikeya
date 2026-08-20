import { requireUser } from '@/lib/auth'
import { formatCarrotFromMicros, formatNumber } from '@/lib/money'

export default async function UsagePage() {
  const { supabase, user } = await requireUser()
  const { data: requests } = await supabase
    .from('api_requests')
    .select('id,channel,model_id,status,input_tokens,output_tokens,retail_cost_micros,error_code,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = requests ?? []
  const totalTokens = rows.reduce((sum: number, r: any) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0)
  const success = rows.filter((r: any) => r.status === 'settled').length
  const successRate = rows.length ? Math.round((success / rows.length) * 100) : 0

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Usage</div>
          <h1>Request logs và chi phí</h1>
          <p>Theo dõi từng lượt gọi, token và số credit đã trừ. Dữ liệu bên dưới là 100 request gần nhất của tài khoản.</p>
        </div>
      </header>

      <div className="usage-summary">
        <div className="surface mini-stat"><span>Requests</span><strong>{formatNumber(rows.length)}</strong></div>
        <div className="surface mini-stat"><span>Tổng token</span><strong>{formatNumber(totalTokens)}</strong></div>
        <div className="surface mini-stat"><span>Tỷ lệ thành công</span><strong>{successRate}%</strong></div>
      </div>

      <section className="surface model-table-shell">
        <div className="surface-head"><h2>Request gần đây</h2><span className="status-chip">Tối đa 100 dòng</span></div>
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Thời gian</th><th>Request ID</th><th>Kênh</th><th>Model</th><th>Input</th><th>Output</th><th>Credit</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {rows.map((r: any) => {
                  const state = r.status === 'settled' ? ['success','Thành công'] : r.status === 'released' ? ['', 'Đã hoàn tạm giữ'] : r.status === 'failed_ambiguous' ? ['warning','Cần đối soát'] : ['danger', r.status]
                  return (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                      <td><code>{r.id.slice(0, 8)}</code></td>
                      <td>{r.channel === 'playground' ? 'Playground' : 'API key'}</td>
                      <td><code>{r.model_id}</code></td>
                      <td>{formatNumber(r.input_tokens ?? 0)}</td>
                      <td>{formatNumber(r.output_tokens ?? 0)}</td>
                      <td><strong>{formatCarrotFromMicros(r.retail_cost_micros ?? '0')}</strong></td>
                      <td><span className={`status-chip ${state[0]}`}>{state[1]}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="surface-body"><div className="empty-card"><div className="empty-icon">R</div><strong>Chưa có request</strong><p>Request từ Playground hoặc API key sẽ xuất hiện tại đây cùng token, chi phí và trạng thái.</p></div></div>
        )}
      </section>
    </div>
  )
}
