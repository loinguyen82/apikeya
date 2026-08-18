import { requireUser } from '@/lib/auth'
import { formatVndFromMicros, formatNumber } from '@/lib/money'

export default async function UsagePage() {
  const { supabase, user } = await requireUser()

  const { data: requests } = await supabase
    .from('api_requests')
    .select('id,channel,model_id,status,input_tokens,output_tokens,retail_cost_micros,error_code,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div>
        <h1>Báo Cáo Chi Tiêu & Lịch Sử Sử Dụng 📊</h1>
        <p className="muted">
          Kiểm toán minh bạch từng lượt gọi API: số token đầu vào (prompt), số token đầu ra (completion) và số tiền VNĐ bị trừ.
        </p>
      </div>

      <div className="card stack">
        <h3>Lịch sử 100 lượt gọi gần nhất</h3>
        {requests && requests.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Mã lượt (ID)</th>
                  <th>Kênh</th>
                  <th>Mô hình</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Chi phí (VNĐ)</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r: any) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                    <td><code>{r.id.slice(0, 8)}</code></td>
                    <td>
                      <span className="badge" style={{ fontSize: '11px' }}>
                        {r.channel === 'playground' ? 'Dùng thử' : 'API Key'}
                      </span>
                    </td>
                    <td><code>{r.model_id}</code></td>
                    <td>{formatNumber(r.input_tokens ?? 0)}</td>
                    <td>{formatNumber(r.output_tokens ?? 0)}</td>
                    <td style={{ fontWeight: 600 }}>{formatVndFromMicros(r.retail_cost_micros ?? '0')}</td>
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
                        {r.status === 'settled'
                          ? 'Đã thanh toán'
                          : r.status === 'released'
                          ? 'Đã hoàn tạm giữ'
                          : r.status === 'failed_ambiguous'
                          ? 'Cần đối soát'
                          : r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Chưa có dữ liệu sử dụng.
          </div>
        )}
      </div>
    </div>
  )
}
