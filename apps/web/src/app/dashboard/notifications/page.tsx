import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatCreditFromMicros } from '@/lib/money'

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser()
  const [{ data: wallet }, { data: activeKey }, { data: latestRequest }] = await Promise.all([
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).maybeSingle(),
    supabase.from('api_keys').select('id,name,prefix,last_used_at').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('api_requests').select('id,model_id,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const reserved = BigInt(wallet?.reserved_micros ?? '0')

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy"><div className="eyebrow">Notifications</div><h1>Thông báo hệ thống</h1><p>Các trạng thái quan trọng được suy ra từ account thật; APIVN chưa bật hộp thư và trạng thái đã đọc.</p></div>
      </header>

      <section className="notification-list">
        <article className="notification-item warning">
          <span className="notification-dot" />
          <div><span className="mock-badge">Đang triển khai</span><h2>PayOS chưa được kết nối</h2><p>Billing chỉ mô phỏng UI và không cộng số dư. Không chuyển khoản theo QR demo.</p><Link href="/dashboard/billing">Xem checkout mô phỏng →</Link></div>
        </article>
        <article className={`notification-item ${activeKey ? 'success' : 'warning'}`}>
          <span className="notification-dot" />
          <div><span className={`status-chip ${activeKey ? 'success' : 'warning'}`}>{activeKey ? 'Credential active' : 'Cần thao tác'}</span><h2>{activeKey ? `${activeKey.name} đang hoạt động` : 'Chưa có API key đang hoạt động'}</h2><p>{activeKey ? `Prefix ${activeKey.prefix}••••••. Rotate key không làm mất wallet hoặc logs.` : 'Sau khi có số dư thật, tạo key để dùng API và đăng nhập nhanh vào console.'}</p><Link href="/dashboard/api-keys">Quản lý API key →</Link></div>
        </article>
        <article className={`notification-item ${reserved > 0n ? 'warning' : 'success'}`}>
          <span className="notification-dot" />
          <div><span className={`status-chip ${reserved > 0n ? 'warning' : 'success'}`}>Wallet</span><h2>{reserved > 0n ? `${formatCreditFromMicros(reserved)} đang tạm giữ` : 'Không có Credit đang tạm giữ'}</h2><p>{latestRequest ? `Request gần nhất dùng ${latestRequest.model_id}, trạng thái ${latestRequest.status}.` : 'Chưa có request nào trên tài khoản này.'}</p><Link href="/dashboard/usage">Mở request logs →</Link></div>
        </article>
      </section>
    </div>
  )
}
