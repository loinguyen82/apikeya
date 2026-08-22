import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { BrandLogo } from '@/components/BrandLogo'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <div className="shell">
    <header className="console-header">
      <div className="console-header-inner">
        <div className="admin-brand"><BrandLogo href="/admin" gradientId="apivn-admin-gradient" /><span className="status-chip">Admin</span></div>
        <div className="console-actions"><Link href="/dashboard" className="btn secondary">Customer console</Link></div>
      </div>
      <nav className="console-tabs" aria-label="Điều hướng quản trị"><Link href="/admin">Tổng quan</Link><Link href="/admin/topups">Nạp tiền</Link><Link href="/admin/models">Models & routing</Link><Link href="/admin/requests">Requests</Link></nav>
    </header>
    <main className="main">{children}</main>
  </div>
}
