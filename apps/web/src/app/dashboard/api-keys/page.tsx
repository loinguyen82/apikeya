import { requireUser } from '@/lib/auth'

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; key?: string }>
}) {
  const { supabase, user } = await requireUser()
  const params = await searchParams

  const { data: keys } = await supabase
    .from('api_keys')
    .select('id,name,prefix,status,last_used_at,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div className="row">
        <div>
          <h1>Quản lý Khóa API (API Keys) 🔑</h1>
          <p className="muted">
            API key hoạt động như mật khẩu để ứng dụng của bạn gọi tới cổng AI Gateway.
          </p>
        </div>
        <form action="/api/keys" method="post">
          <button className="btn" type="submit">
            + Tạo API key mới
          </button>
        </form>
      </div>

      {params.created === 'true' && params.key && (
        <div
          style={{
            background: 'var(--success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
          }}
          className="stack"
        >
          <h3 style={{ color: 'var(--success)' }}>🎉 Tạo API Key Thành Công!</h3>
          <p style={{ fontSize: '14px' }}>
            Hãy <strong>sao chép và lưu trữ ngay</strong>. Vì lý do bảo mật, khóa bí mật này sẽ <strong>không bao giờ hiển thị lại</strong>.
          </p>
          <pre
            style={{
              padding: '12px 16px',
              background: 'var(--bg)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              userSelect: 'all',
            }}
          >
            {params.key}
          </pre>
        </div>
      )}

      <div className="card stack">
        <h3>Danh sách API Key của bạn</h3>
        {keys && keys.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Tên định danh</th>
                <th>Khóa (Prefix)</th>
                <th>Trạng thái</th>
                <th>Dùng gần nhất</th>
                <th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k: any) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.name}</td>
                  <td><code>{k.prefix}••••••••••••</code></td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: k.status === 'active' ? 'var(--success-bg)' : 'var(--danger-bg)',
                        color: k.status === 'active' ? 'var(--success)' : 'var(--danger)',
                        borderColor: k.status === 'active' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                      }}
                    >
                      {k.status === 'active' ? 'Hoạt động' : 'Đã thu hồi'}
                    </span>
                  </td>
                  <td className="muted">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString('vi-VN') : 'Chưa sử dụng'}
                  </td>
                  <td className="muted">{new Date(k.created_at).toLocaleDateString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Bạn chưa tạo API key nào. Nhấn nút <strong>"Tạo API key mới"</strong> ở trên để bắt đầu tích hợp vào code.
          </div>
        )}
      </div>
    </div>
  )
}
