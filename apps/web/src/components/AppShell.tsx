'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const API_KEY_SESSION_STORAGE_KEY = 'apivn.portal.apiKey'

const nav = [
  ['/dashboard', 'Overview'],
  ['/dashboard/hexa', 'Hexa'],
  ['/dashboard/api-keys', 'API Keys'],
  ['/dashboard/quota', 'Quota'],
  ['/dashboard/models', 'Model available'],
  ['/docs', '⚙️ Cấu hình sẵn'],
  ['/dashboard/billing', '🥕 Nạp quota'],
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  function clearApiKeySession() {
    try {
      window.sessionStorage.removeItem(API_KEY_SESSION_STORAGE_KEY)
    } catch {
      // Sign-out must still work when browser storage is unavailable.
    }
  }

  return (
    <div className="shell">
      <header className="console-header">
        <div className="console-header-inner">
          <Link href="/dashboard" className="console-brand">
            <span className="console-mark">V</span>
            <span>
              <strong>AI API</strong>
              <small>Developer Console</small>
            </span>
          </Link>

          <div className="console-actions">
            <Link href="/docs" className="console-action-link">Docs</Link>
            <Link href="/admin" className="console-action-link">🛡️ Admin</Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="console-logout" onClick={clearApiKeySession}>Đăng xuất</button>
            </form>
          </div>
        </div>

        <nav className="console-tabs" aria-label="Điều hướng dashboard">
          {nav.map(([href, label]) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
            return (
              <Link href={href} key={href} className={isActive ? 'active' : ''}>
                {label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="main">{children}</main>
      <footer className="console-footer">
        <div>
          <strong>AI API Developer Console</strong>
          <span>Quota, model, test request và logs trong 24 giờ.</span>
        </div>
        <div className="console-footer-links">
          <span>Chính sách</span>
          <Link href="/docs">Tài liệu</Link>
          <Link href="/dashboard/billing">Thanh toán</Link>
          <Link href="/dashboard/quota">Quota</Link>
        </div>
      </footer>
    </div>
  )
}
