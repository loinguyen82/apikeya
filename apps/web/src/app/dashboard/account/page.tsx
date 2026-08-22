import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatCreditFromMicros, formatNumber } from '@/lib/money'

export default async function AccountPage() {
  const { supabase, user } = await requireUser()
  const [{ data: profile }, { data: wallet }, { count: keyCount }, { count: requestCount }] = await Promise.all([
    supabase.from('profiles').select('display_name,role').eq('id', user.id).maybeSingle(),
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).maybeSingle(),
    supabase.from('api_keys').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('api_requests').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy"><div className="eyebrow">Account</div><h1>Tài khoản</h1><p>Thông tin đăng nhập, wallet và hoạt động gắn với APIVN account của bạn.</p></div>
      </header>

      <div className="account-grid">
        <section className="surface surface-pad">
          <div className="eyebrow">Profile</div>
          <h2 style={{ margin: '5px 0 18px', fontSize: 21 }}>{profile?.display_name || 'APIVN user'}</h2>
          <div className="mock-details">
            <div className="mock-line"><span>Email</span><strong>{user.email ?? '—'}</strong></div>
            <div className="mock-line"><span>Vai trò</span><strong>{profile?.role === 'admin' ? 'Admin' : 'Member'}</strong></div>
            <div className="mock-line"><span>API keys</span><strong>{formatNumber(keyCount ?? 0)}</strong></div>
            <div className="mock-line"><span>Requests</span><strong>{formatNumber(requestCount ?? 0)}</strong></div>
          </div>
        </section>

        <section className="surface surface-pad">
          <div className="eyebrow">Wallet</div>
          <div className="balance-value" style={{ marginTop: 8 }}>{formatCreditFromMicros(wallet?.available_micros ?? '0')}</div>
          <p className="muted">Đang tạm giữ: {formatCreditFromMicros(wallet?.reserved_micros ?? '0')}</p>
          <div className="notice" style={{ marginTop: 18 }}>Đăng xuất sẽ xoá session console trên thiết bị này; API key đang hoạt động không bị thu hồi.</div>
          <form action="/auth/signout" method="post"><button type="submit" className="btn secondary" style={{ width: '100%', marginTop: 14 }}>Đăng xuất khỏi APIVN</button></form>
        </section>
      </div>

      <section className="surface surface-pad">
        <div className="eyebrow">Điều hướng thêm</div>
        <h2 style={{ margin: '5px 0 14px', fontSize: 18 }}>Công cụ và hỗ trợ</h2>
        <div className="account-shortcuts">
          <Link href="/dashboard/config">Cấu hình sẵn</Link>
          <Link href="/dashboard/playground">Test model</Link>
          <Link href="/dashboard/usage">Request logs</Link>
          <Link href="/dashboard/notifications">Thông báo</Link>
          <Link href="/docs">Tài liệu</Link>
          {profile?.role === 'admin' && <Link href="/admin">Quản trị</Link>}
        </div>
      </section>
    </div>
  )
}
