'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  ['/dashboard', 'Overview'],
  ['/dashboard/billing', 'Billing'],
  ['/dashboard/playground', 'Playground'],
  ['/dashboard/models', 'Models'],
  ['/dashboard/api-keys', 'API keys'],
  ['/dashboard/usage', 'Request logs'],
  ['/docs', 'Docs'],
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="shell">
      <header className="console-header">
        <div className="console-header-inner">
          <Link href="/dashboard" className="console-brand">
            <span className="console-mark">A</span>
            <span><strong>Apikeya</strong><small>Developer Console</small></span>
          </Link>

          <div className="console-actions">
            <Link href="/admin" className="console-action-link">Admin</Link>
            <form action="/auth/signout" method="post"><button type="submit" className="console-logout">Đăng xuất</button></form>
          </div>
        </div>

        <nav className="console-tabs" aria-label="Điều hướng dashboard">
          {nav.map(([href, label]) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
            return <Link href={href} key={href} className={isActive ? 'active' : ''}>{label}</Link>
          })}
        </nav>
      </header>

      <main className="main">{children}</main>

      <footer className="console-footer">
        <div><strong>Apikeya Developer Console</strong><span>Nạp tiền, test model, tạo key và theo dõi request trong một nơi.</span></div>
        <div className="console-footer-links"><Link href="/docs">Tài liệu</Link><Link href="/dashboard/billing">Thanh toán</Link><Link href="/dashboard/usage">Request logs</Link></div>
      </footer>
    </div>
  )
}
