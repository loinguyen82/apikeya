import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatVndFromMicros, formatNumber } from '@/lib/money'

export default async function DashboardPage() {
  const { supabase, user } = await requireUser()

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

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div className="row">
        <div>
          <h1>Tổng quan dịch vụ 👋</h1>
          <p className="muted">Chào mừng bạn! Quản lý số dư, thử nghiệm model và kết nối ứng dụng.</p>
        </div>
        <div className="row" style={{ gap: '10px' }}>
          <Link href="/dashboard/playground" className="btn secondary">
            Dùng thử ngay →
          </Link>
          <Link href="/dashboard/billing" className="btn">
            Nạp tiền số dư
          </Link>
        </div>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <span className="muted">Số dư dùng được (VNĐ)</span>
          <strong style={{ color: 'var(--primary-hover)', fontSize: '32px' }}>
            {formatVndFromMicros(wallet?.available_micros ?? '0')}
          </strong>
          <div className="row" style={{ fontSize: '13px', marginTop: '4px' }}>
            <span className="muted">Đang tạm giữ: {formatVndFromMicros(wallet?.reserved_micros ?? '0')}</span>
            <Link href="/dashboard/billing" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Nạp thêm →
            </Link>
          </div>
        </div>

        <div className="card kpi">
          <span className="muted">Tổng lượt gọi API</span>
          <strong>{formatNumber(requestCount ?? 0)}</strong>
          <Link href="/dashboard/usage" className="muted" style={{ fontSize: '13px' }}>
            Xem chi tiết chi tiêu →
          </Link>
        </div>

        <div className="card kpi" style={{ justifyContent: 'center' }}>
          <span className="muted">Lộ trình sử dụng nhanh</span>
          <div style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
            <div>1. <Link href="/dashboard/playground" style={{ color: 'var(--primary)' }}>Dùng thử trên Web</Link></div>
            <div>2. <Link href="/dashboard/billing" style={{ color: 'var(--primary)' }}>Nạp số dư dịch vụ</Link></div>
            <div>3. <Link href="/dashboard/api-keys" style={{ color: 'var(--primary)' }}>Tạo API key & Tích hợp</Link></div>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <h3>5 Lượt sử dụng gần nhất</h3>
          <Link href="/dashboard/usage" className="muted" style={{ fontSize: '13px' }}>
            Xem tất cả →
          </Link>
        </div>

        {recentRequests && recentRequests.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mô hình</th>
                <th>Tổng Token</th>
                <th>Chi phí (VNĐ)</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {recentRequests.map((r: any) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                  <td><code>{r.model_id}</code></td>
                  <td>{formatNumber((r.input_tokens ?? 0) + (r.output_tokens ?? 0))}</td>
                  <td style={{ fontWeight: 600 }}>{formatVndFromMicros(r.retail_cost_micros ?? '0')}</td>
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
        ) : (
          <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Bạn chưa có lượt sử dụng nào. Hãy vào trang{' '}
            <Link href="/dashboard/playground" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Dùng thử
            </Link>{' '}
            để trải nghiệm!
          </div>
        )}
      </div>
    </div>
  )
}
