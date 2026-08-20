import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <div className="shell">
    <header className="console-header">
      <div className="console-header-inner">
        <Link href="/admin" className="console-brand"><span className="console-mark">A</span><span><strong>Apikeya Admin</strong><small>Operations console</small></span></Link>
        <div className="console-actions"><Link href="/dashboard" className="btn secondary">Customer console</Link></div>
      </div>
      <nav className="console-tabs" aria-label="Điều hướng quản trị"><Link href="/admin">Tổng quan</Link><Link href="/admin/topups">Nạp tiền</Link><Link href="/admin/models">Models & routing</Link><Link href="/admin/requests">Requests</Link></nav>
    </header>
    <main className="main">{children}</main>
  </div>
}
