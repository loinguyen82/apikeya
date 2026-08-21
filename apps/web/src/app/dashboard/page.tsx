import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatNumber, formatVnd, formatCreditFromMicros, formatCreditUsageFromMicros } from '@/lib/money'
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

  const availableMicros = BigInt(wallet?.available_micros ?? '0')
  const hasBalance = availableMicros > 0n
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
            Từ nạp tiền đến request đầu tiên, mọi bước đều nằm trong console này.
          </p>
        </div>
        <div className="dashboard-actions">
          {!isAdmin && !hasBalance ? (
            <Link href="/dashboard/billing" className="btn">Nạp 20.000đ để bắt đầu</Link>
          ) : (
            <Link href="/dashboard/playground" className="btn">Test model</Link>
          )}
          <Link href="/dashboard/api-keys" className="btn secondary">API keys</Link>
        </div>
      </div>

      {!isAdmin && !hasBalance && (
        <div className="notice warning">
          Tài khoản chưa có số dư. Nạp tối thiểu 20.000đ trước, sau đó test model trong Playground rồi mới tạo key để tích hợp.
        </div>
      )}

      <div className="kpis refresh-kpis">
        <div className="card kpi">
          <span className="metric-label">Số dư khả dụng</span>
          <strong className="metric-value">{displayBalance}</strong>
          <span className="metric-foot">
            {isAdmin && a6Live ? `A6 live · $${a6Live.usd.toFixed(2)} USD` : '1 Credit = 1.000đ · credit không hết hạn'}
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
          <span className="metric-foot">Được hoàn hoặc quyết toán theo trạng thái request</span>
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
                      <td><strong>{formatCreditUsageFromMicros(request.retail_cost_micros ?? '0')}</strong></td>
                      <td>
                        <span className="badge">
                          {request.status === 'settled' ? 'Thành công' : request.status === 'failed_ambiguous' ? 'Đang đối soát' : request.status}
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
              <span className="muted">{hasBalance ? 'Chạy thử một model để request đầu tiên xuất hiện ở đây.' : 'Nạp số dư trước để bắt đầu test model.'}</span>
              <Link href={hasBalance ? '/dashboard/playground' : '/dashboard/billing'} className="btn" style={{ marginTop: '8px' }}>
                {hasBalance ? 'Gửi request đầu tiên' : 'Nạp tiền'}
              </Link>
            </div>
          )}
        </section>

        <aside className="card stack" style={{ gap: '18px' }}>
          <div>
            <h3>Bắt đầu đúng flow</h3>
            <p className="muted" style={{ marginTop: '4px' }}>Giảm tối đa bước lỗi ở tài khoản mới.</p>
          </div>

          <div className="stack" style={{ gap: '14px' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>01 · Nạp số dư</strong>
              <p className="muted" style={{ fontSize: '12px' }}>Từ 20.000đ qua VietQR. 1 Credit = 1.000đ.</p>
            </div>
            <div>
              <strong style={{ fontSize: '14px' }}>02 · Test model</strong>
              <p className="muted" style={{ fontSize: '12px' }}>Dùng Playground để kiểm tra model trước khi tích hợp.</p>
            </div>
            <div>
              <strong style={{ fontSize: '14px' }}>03 · Tạo API key</strong>
              <p className="muted" style={{ fontSize: '12px' }}>Một key dùng cho toàn bộ model đang khả dụng.</p>
            </div>
            <div>
              <strong style={{ fontSize: '14px' }}>04 · Đổi Base URL</strong>
              <p className="muted" style={{ fontSize: '12px' }}>Giữ nguyên SDK, chỉ đổi endpoint và model ID.</p>
            </div>
          </div>

          <div className="code-panel">{`OPENAI_BASE_URL=…/v1\nOPENAI_API_KEY=sk-...`}</div>

          <div className="row" style={{ justifyContent: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
            {!hasBalance && !isAdmin ? <Link href="/dashboard/billing" className="btn">Nạp tiền</Link> : <Link href="/dashboard/playground" className="btn">Test model</Link>}
            <Link href="/docs" className="btn secondary">Xem docs</Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
