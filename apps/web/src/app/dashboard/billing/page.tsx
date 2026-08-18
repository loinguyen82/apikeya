import { requireUser } from '@/lib/auth'
import { formatVndFromMicros, formatVnd } from '@/lib/money'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string }>
}) {
  const { supabase, user } = await requireUser()
  const params = await searchParams

  const [{ data: wallet }, { data: topups }, { data: currentTopup }] = await Promise.all([
    supabase.from('wallets').select('*').eq('user_id', user.id).single(),
    supabase.from('topups').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    params.topup
      ? supabase.from('topups').select('*').eq('id', params.topup).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div>
        <h1>Nạp Số Dư Dịch Vụ 💳</h1>
        <p className="muted">
          Số dư dịch vụ được dùng để chi trả cho các lượt gọi AI API trên hệ thống. Không thể quy đổi thành tiền mặt hoặc rút về tài khoản ngân hàng.
        </p>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <span className="muted">Số dư dùng được</span>
          <strong style={{ color: 'var(--primary-hover)', fontSize: '32px' }}>
            {formatVndFromMicros(wallet?.available_micros ?? '0')}
          </strong>
          <span className="muted" style={{ fontSize: '13px' }}>
            Đang tạm giữ: {formatVndFromMicros(wallet?.reserved_micros ?? '0')}
          </span>
        </div>

        <div className="card stack" style={{ gap: '12px' }}>
          <h3>Nạp nhanh số dư</h3>
          <form action="/api/topups" method="post" className="stack" style={{ gap: '10px' }}>
            <select className="input" name="amount" defaultValue="100000">
              <option value="50000">50.000đ (Không tặng kèm)</option>
              <option value="100000">100.000đ (Tặng 0%)</option>
              <option value="200000">200.000đ (Tặng 0%)</option>
              <option value="500000">500.000đ (+ Tặng 5% = 525.000đ)</option>
              <option value="1000000">1.000.000đ (+ Tặng 10% = 1.100.000đ)</option>
            </select>
            <button className="btn" type="submit">
              Tạo yêu cầu nạp VietQR →
            </button>
          </form>
        </div>

        <div className="card stack" style={{ gap: '10px' }}>
          <h3>Nguyên tắc giao dịch</h3>
          <ul style={{ paddingLeft: '18px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <li>Chuyển khoản chính xác số tiền và nội dung mã lệnh.</li>
            <li>Hệ thống cộng số dư tự động trong 30s sau khi nhận được tiền.</li>
            <li>Không hỗ trợ chuyển nhượng số dư giữa các tài khoản.</li>
          </ul>
        </div>
      </div>

      {currentTopup?.data && (
        <div
          style={{
            background: 'var(--surface)',
            border: '2px solid var(--primary)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
          }}
          className="stack"
        >
          <div className="row">
            <div>
              <h2>Yêu Cầu Nạp Tiền: #{currentTopup.data.id.slice(0, 8)}</h2>
              <p className="muted">Quét mã QR hoặc chuyển khoản thủ công theo thông tin bên dưới:</p>
            </div>
            <span
              className="badge"
              style={{
                background: currentTopup.data.status === 'paid' ? 'var(--success-bg)' : 'var(--warning-bg)',
                color: currentTopup.data.status === 'paid' ? 'var(--success)' : 'var(--warning)',
              }}
            >
              {currentTopup.data.status === 'paid' ? 'Đã thanh toán' : 'Đang chờ chuyển khoản'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              padding: '16px',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div>
              <span className="muted" style={{ fontSize: '13px' }}>Số tiền cần chuyển:</span>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary)' }}>
                {formatVnd(currentTopup.data.payable_vnd)}
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: '13px' }}>Số dư nhận được:</span>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>
                {formatVndFromMicros(
                  BigInt(currentTopup.data.amount_micros) + BigInt(currentTopup.data.bonus_micros)
                )}
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: '13px' }}>Nội dung chuyển khoản (Bắt buộc):</span>
              <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                NAP {currentTopup.data.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card stack">
        <h3>10 Giao dịch nạp gần nhất</h3>
        {topups && topups.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mã giao dịch</th>
                <th>Số tiền nạp</th>
                <th>Số dư nhận được</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {topups.map((t: any) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString('vi-VN')}</td>
                  <td><code>{t.id.slice(0, 8)}</code></td>
                  <td>{formatVnd(t.payable_vnd)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatVndFromMicros(BigInt(t.amount_micros) + BigInt(t.bonus_micros))}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: t.status === 'paid' ? 'var(--success-bg)' : 'var(--warning-bg)',
                        color: t.status === 'paid' ? 'var(--success)' : 'var(--warning)',
                      }}
                    >
                      {t.status === 'paid' ? 'Thành công' : t.status === 'pending' ? 'Chờ thanh toán' : t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Chưa có lịch sử nạp tiền.
          </div>
        )}
      </div>
    </div>
  )
}
