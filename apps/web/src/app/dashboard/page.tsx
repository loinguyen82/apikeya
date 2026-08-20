import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatNumber, formatVnd, formatCreditFromMicros, formatCarrotFromMicros } from '@/lib/money'
import { getA6LiveBalance } from '@/lib/a6'
import { isAdminUser } from '@/lib/admin'

export default async function DashboardPage() {
  const { supabase, user } = await requireUser()
  const isAdmin = await isAdminUser(supabase, user)

  let a6Live: { usd: number; vnd: number } | null = null
  if (isAdmin) {
    try {
      a6Live = await getA6LiveBalance()
    } catch {
      a6Live = null
    }
  }

  const [{ data: wallet }, { count: requestCount }, { data: recentRequests }] = await Promise.all([
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).single(),
    supabase.from('api_requests').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase
      .from('api_requests')
      .select('id,model_id,retail_cost_micros,input_tokens,output_tokens,status,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const displayBalance = isAdmin && a6Live
    ? formatVnd(a6Live.vnd)
    : formatCreditFromMicros(wallet?.available_micros ?? '0')

  const reservedBalance = formatCreditFromMicros(wallet?.reserved_micros ?? '0')

  return (
    <div className="stack" style={{ gap: '14px' }}>
      <div className="dashboard-head">
        <div>
          <h1>Overview</h1>
          <p className="muted" style={{ marginTop: '6px' }}>
            Theo dõi số dư, request và trạng thái sử dụng của tài khoản.
          </p>
        </div>
        <div className="dashboard-actions">
          <Link href="/dashboard/playground" className="btn secondary">Mở Playground</Link>
          {!isAdmin && <Link href="/dashboard/billing" className="btn">Nạp tiền</Link>}
        </div>
      </div>

      <div className="kpis refresh-kpis">
        <div className="card kpi">
          <span className="metric-label">Số dư khả dụng</span>
          <strong className="metric-value">{displayBalance}</strong>
          <span className="metric-foot">
            {isAdmin && a6Live ? `A6 live · $${a6Live.usd.toFixed(2)} USD` : 'Sẵn sàng dùng cho request mới'}
          </span>
        </div>

        <div className="card kpi">
          <span className="metric-label">Tổng request</span>
          <strong className="metric-value">{formatNumber(requestCount ?? 0)}</strong>
          <Link href="/dashboard/usage" className="metric-foot">Xem request logs →</Link>
        </div>

        <div className="card kpi">
          <span className="metric-label">Đang tạm giữ</span>
          <strong className="metric-value">{reservedBalance}</strong>
          <span className="metric-foot">Tự giải phóng khi request được quyết toán</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card stack" style={{ gap: '16px' }}>
          <div className="panel-head">
            <div>
              <h3>Recent requests</h3>
              <p className="muted" style={{ fontSize: '12px', marginTop: '4px' }}>5 request gần nhất của tài khoản.</p>
            </div>
            <Link href="/dashboard/usage" className="btn secondary">Xem tất cả</Link>
          </div>

          {recentRequests && recentRequests.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Model</th>
                    <th>Token</th>
                    <th>Chi phí</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((request: any) => (
                    <tr key={request.id}>
                      <td>{new Date(request.created_at).toLocaleString('vi-VN')}</td>
                      <td><code>{request.model_id}</code></td>
                      <td>{formatNumber((request.input_tokens ?? 0) + (request.output_tokens ?? 0))}</td>
                      <td><strong>{formatCarrotFromMicros(request.retail_cost_micros ?? '0')}</strong></td>
                      <td>
                        <span className="badge">
                          {request.status === 'settled' ? 'Thành công' : request.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <strong>Chưa có request nào</strong>
              <span className="muted">Chạy thử một model để request đầu tiên xuất hiện ở đây.</span>
              <Link href="/dashboard/playground" className="btn" style={{ marginTop: '8px' }}>Gửi request đầu tiên</Link>
            </div>
          )}
        </section>

        <aside className="card stack" style={{ gap: '18px' }}>
          <div>
            <h3>Bắt đầu nhanh</h3>
            <p className="muted" style={{ marginTop: '4px' }}>Từ tài khoản mới đến request đầu tiên.</p>
          </div>

          <div className="stack" style={{ gap: '14px' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>01 · Chọn model</strong>
              <p className="muted" style={{ fontSize: '12px' }}>Test trực tiếp trong Playground trước khi tích hợp.</p>
            </div>
            <div>
              <strong style={{ fontSize: '14px' }}>02 · Tạo API key</strong>
              <p className="muted" style={{ fontSize: '12px' }}>Một key dùng cho toàn bộ model đang khả dụng.</p>
            </div>
            <div>
              <strong style={{ fontSize: '14px' }}>03 · Đổi Base URL</strong>
              <p className="muted" style={{ fontSize: '12px' }}>Giữ nguyên SDK, chỉ đổi endpoint sang Apikeya.</p>
            </div>
          </div>

          <div className="code-panel">{`OPENAI_BASE_URL=…/v1\nOPENAI_API_KEY=apikeya_...`}</div>

          <div className="row" style={{ justifyContent: 'flex-start', gap: '8px' }}>
            <Link href="/dashboard/api-keys" className="btn">Tạo API key</Link>
            <Link href="/docs" className="btn secondary">Xem docs</Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
