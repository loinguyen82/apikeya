import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <main className="container" style={{ padding: '32px 20px 80px' }}>
      <div className="row" style={{ marginBottom: '24px' }}>
        <div className="brand" style={{ fontSize: '20px' }}>
          <span>🛡️</span>
          <span>AI API Admin Portal</span>
        </div>
        <div className="row" style={{ gap: '16px' }}>
          <Link href="/admin" className="btn secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
            Tổng quan KPIs
          </Link>
          <Link href="/admin/models" className="btn secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
            Mô hình & Định tuyến
          </Link>
          <Link href="/admin/requests" className="btn secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
            Đối soát Requests
          </Link>
          <Link href="/dashboard" className="btn" style={{ padding: '8px 14px', fontSize: '13px' }}>
            Về Dashboard Khách hàng →
          </Link>
        </div>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', marginBottom: '32px' }} />
      {children}
    </main>
  )
}
