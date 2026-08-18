'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  ['/dashboard', 'Tổng quan'],
  ['/dashboard/playground', 'Dùng thử'],
  ['/dashboard/models', 'Mô hình AI'],
  ['/dashboard/api-keys', 'API key'],
  ['/dashboard/billing', 'Nạp tiền'],
  ['/dashboard/usage', 'Chi tiêu'],
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>⚡</span>
          <span>AI API</span>
        </div>
        <nav className="nav">
          {nav.map(([href, label]) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
            return (
              <Link href={href} key={href} className={isActive ? 'active' : ''}>
                {label}
              </Link>
            )
          })}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
          <Link href="/docs" className="muted" style={{ display: 'block', marginBottom: '8px' }}>
            📖 Tài liệu tích hợp
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: '13px',
                padding: 0,
              }}
            >
              Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
