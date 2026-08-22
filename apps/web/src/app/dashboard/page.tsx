import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatVndFromMicros, formatNumber, formatVnd, formatCreditFromMicros, formatCarrotFromMicros } from '@/lib/money'
import { getA6LiveBalance } from '@/lib/a6'
import { isAdminUser } from '@/lib/admin'

export default async function DashboardPage() {
  const { supabase, user } = await requireUser()

  const isAdmin = await isAdminUser(supabase, user)

  let a6Live: { usd: number; vnd: number } | null = null

  // Admin chỉ xem số dư live của A6; số dư ví ứng dụng vẫn do ledger quyết toán.
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

  const displayBalance = isAdmin && a6Live ? formatVnd(a6Live.vnd) : formatCreditFromMicros(wallet?.available_micros ?? '0')

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div className="row">
        <div>
          <h1>Developer overview</h1>
          <p className="muted">
            {isAdmin
              ? 'Tài khoản Quản trị viên — Số dư tự động đồng bộ theo thời gian thực từ A6API.'
              : 'Một key, một Base URL, mọi model bạn cần cho code agent và ứng dụng. 🥕 1 Credit = 1.000đ.'}
          </p>
        </div>
        <div className="row" style={{ gap: '10px' }}>
          <Link href="/dashboard/hexa" className="btn secondary">
            Mở Hexa →
          </Link>
          {!isAdmin && (
            <Link href="/dashboard/billing" className="btn">
              Nạp quota
            </Link>
          )}
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <div className="row">
            <span className="muted">🥕 Credit dùng được</span>
            {isAdmin && (
              <span
                className="badge"
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--primary-hover)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                ⚡ Auto A6 Live
              </span>
            )}
          </div>
          <strong style={{ color: 'var(--primary-hover)', fontSize: '32px' }}>{displayBalance}</strong>
          <div className="row" style={{ fontSize: '13px', marginTop: '4px' }}>
            {isAdmin && a6Live ? (
              <span style={{ color: 'var(--success)', fontWeight: 500 }}>
                🪙 Gốc A6: ${a6Live.usd.toFixed(2)} USD (Tỷ giá 25.400đ/$)
              </span>
            ) : isAdmin ? (
              <span className="muted">A6 live balance hiện chưa khả dụng.</span>
            ) : (
              <>
                <span className="muted">Đang tạm giữ: {formatCreditFromMicros(wallet?.reserved_micros ?? '0')}</span>
                <Link href="/dashboard/billing" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  Nạp thêm →
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="card kpi">
          <span className="muted">Tổng lượt gọi API</span>
          <strong>{formatNumber(requestCount ?? 0)}</strong>
          <Link href="/dashboard/quota" className="muted" style={{ fontSize: '13px' }}>
            Xem chi tiết chi tiêu →
          </Link>
        </div>

        <div className="card kpi" style={{ justifyContent: 'center' }}>
          <span className="muted">Bắt đầu trong 3 bước</span>
          <div style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
            <div>
              1.{' '}
              <Link href="/dashboard/hexa" style={{ color: 'var(--primary)' }}>
                Phân tích token với Hexa
              </Link>
            </div>
            <div>
              2.{' '}
              <Link href="/docs" style={{ color: 'var(--primary)' }}>
                Đổi Base URL
              </Link>
            </div>
            <div>
              3.{' '}
              <Link href="/dashboard/api-keys" style={{ color: 'var(--primary)' }}>
                Tạo API key
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <h3>Recent usage</h3>
          <Link href="/dashboard/quota" className="muted" style={{ fontSize: '13px' }}>
            Xem tất cả →
          </Link>
        </div>

        {recentRequests && recentRequests.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Mô hình</th>
                  <th>Tổng Token</th>
                  <th>Credit 🥕</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((r: any) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                    <td>
                      <code>{r.model_id}</code>
                    </td>
                    <td>{formatNumber((r.input_tokens ?? 0) + (r.output_tokens ?? 0))}</td>
                    <td style={{ fontWeight: 600 }}>{formatCarrotFromMicros(r.retail_cost_micros ?? '0')}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: r.status === 'settled' ? 'var(--success-bg)' : 'var(--primary-light)',
                          color: r.status === 'settled' ? 'var(--success)' : '#60a5fa',
                          borderColor: r.status === 'settled' ? 'rgba(16,185,129,0.3)' : 'rgba(96,165,250,0.3)',
                        }}
                      >
                        {r.status === 'settled' ? 'Thành công' : r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Bạn chưa có lượt sử dụng nào. Dùng{' '}
            <Link href="/dashboard/hexa" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Mở Hexa
            </Link>{' '}
            để phân tích token trước khi gọi API.
          </div>
        )}
      </div>
    </div>
  )
}
