import { requireAdmin } from '@/lib/admin'
import { formatVndFromMicros, formatNumber } from '@/lib/money'
import { formatVietnamDateTime } from '@/lib/date'

export default async function AdminRequestsPage() {
  const { admin } = await requireAdmin()

  const { data: requests } = await admin
    .from('api_requests')
    .select('id,user_id,channel,model_id,status,provider_id,retail_cost_micros,upstream_cost_micros,billing_gap_micros,error_code,created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div>
        <h1>Kiểm Tra & Đối Soát Requests 🔍</h1>
        <p className="muted">
          Lịch sử 100 lượt gọi toàn hệ thống phục vụ đối soát chi phí, lợi nhuận gộp và xử lý sự cố.
        </p>
      </div>

      <div className="card stack">
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Mã Request</th>
                <th>Kênh</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Trạng thái</th>
                <th>Giá bán</th>
                <th>Giá vốn</th>
                <th>Chênh lệch</th>
                <th>Lỗi</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {(requests ?? []).map((r: any) => {
                const retail = BigInt(r.retail_cost_micros || 0)
                const upstream = BigInt(r.upstream_cost_micros || 0)
                const margin = retail - upstream

                return (
                  <tr key={r.id}>
                    <td><code>{r.id.slice(0, 8)}</code></td>
                    <td>{r.channel}</td>
                    <td><code>{r.model_id}</code></td>
                    <td>{r.provider_id ?? '-'}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background:
                            r.status === 'settled'
                              ? 'var(--success-bg)'
                              : r.status === 'released'
                              ? 'var(--bg-subtle)'
                              : 'var(--danger-bg)',
                          color:
                            r.status === 'settled'
                              ? 'var(--success)'
                              : r.status === 'released'
                              ? 'var(--text-muted)'
                              : 'var(--danger)',
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatVndFromMicros(retail)}</td>
                    <td className="muted">{formatVndFromMicros(upstream)}</td>
                    <td style={{ color: margin >= 0n ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {formatVndFromMicros(margin)}
                    </td>
                    <td className="muted" style={{ fontSize: '12px' }}>{r.error_code ?? '-'}</td>
                    <td className="muted" style={{ fontSize: '13px' }}>
                      {formatVietnamDateTime(r.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
