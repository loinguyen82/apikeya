'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  ['/dashboard', '📊 Tổng quan'],
  ['/dashboard/playground', '🧪 Dùng thử (Playground)'],
  ['/dashboard/models', '🤖 Danh mục Models'],
  ['/dashboard/api-keys', '🔑 Quản lý API Key'],
  ['/dashboard/billing', '💳 Nạp tiền VietQR'],
  ['/dashboard/usage', '📈 Lịch sử chi tiêu'],
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>⚡</span>
          <span>AI API Reseller</span>
        </div>

        <nav className="nav" style={{ marginTop: '12px' }}>
          {nav.map(([href, label]) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
            return (
              <Link href={href} key={href} className={isActive ? 'active' : ''}>
                {label}
              </Link>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--line)' }} className="stack">
          <Link
            href="/admin"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(99, 102, 241, 0.1)',
              color: 'var(--primary-hover)',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🛡️ Cổng Quản Trị Admin
          </Link>

          <Link href="/docs" className="muted" style={{ fontSize: '13px', textDecoration: 'none', marginTop: '4px' }}>
            📖 Tài liệu tích hợp API
          </Link>

          <form action="/auth/signout" method="post" style={{ marginTop: '6px' }}>
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: '13px',
                padding: 0,
                fontWeight: 500,
              }}
            >
              🚪 Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
