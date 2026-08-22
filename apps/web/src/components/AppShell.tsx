'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from './BrandLogo'
import { TideIcon } from './TideIcon'

type IconName = Parameters<typeof TideIcon>[0]['name']
type NavItem = { href: string; label: string; icon: IconName }

const primaryNav: NavItem[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: 'overview' },
  { href: '/dashboard/api-keys', label: 'API keys', icon: 'key' },
  { href: '/dashboard/models', label: 'Model khả dụng', icon: 'models' },
  { href: '/dashboard/config', label: 'Cấu hình sẵn', icon: 'config' },
  { href: '/dashboard/playground', label: 'Test model', icon: 'play' },
  { href: '/dashboard/usage', label: 'Request logs', icon: 'usage' },
  { href: '/dashboard/notifications', label: 'Thông báo', icon: 'bell' },
]

const accountNav: NavItem[] = [
  { href: '/dashboard/billing', label: 'Nạp tiền', icon: 'billing' },
  { href: '/dashboard/account', label: 'Tài khoản', icon: 'user' },
  { href: '/docs', label: 'Tài liệu', icon: 'docs' },
]

const mobileNav: NavItem[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: 'overview' },
  { href: '/dashboard/api-keys', label: 'API key', icon: 'key' },
  { href: '/dashboard/models', label: 'Models', icon: 'models' },
  { href: '/dashboard/billing', label: 'Nạp tiền', icon: 'billing' },
  { href: '/dashboard/account', label: 'Thêm', icon: 'user' },
]

const mobileMoreRoutes = [
  '/dashboard/account',
  '/dashboard/config',
  '/dashboard/playground',
  '/dashboard/usage',
  '/dashboard/notifications',
  '/admin',
]

function matchesPath(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}

function NavLink({ item, pathname, activeOverride }: { item: NavItem; pathname: string; activeOverride?: boolean }) {
  const active = activeOverride ?? matchesPath(pathname, item.href)
  return (
    <Link href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
      <TideIcon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  )
}

export function AppShell({
  children,
  user,
}: {
  children: ReactNode
  user: { displayName: string; email: string; balanceLabel: string; isAdmin: boolean }
}) {
  const pathname = usePathname()
  const allNav = [...primaryNav, ...accountNav]
  const current = allNav.find((item) => matchesPath(pathname, item.href))
  const initial = (user.displayName || user.email || 'A').trim().slice(0, 1).toUpperCase()

  return (
    <div className="tide-shell">
      <aside className="tide-sidebar">
        <div className="tide-sidebar-brand"><BrandLogo href="/dashboard" gradientId="apivn-sidebar-gradient" /></div>

        <nav className="tide-nav" aria-label="Điều hướng console">
          <div className="tide-nav-label">Workspace</div>
          {primaryNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          <div className="tide-nav-label">Tài khoản</div>
          {accountNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          {user.isAdmin && <NavLink item={{ href: '/admin', label: 'Quản trị', icon: 'admin' }} pathname={pathname} />}
        </nav>

        <div className="tide-sidebar-foot">
          <div className="sidebar-profile">
            <span className="sidebar-avatar">{initial}</span>
            <span>
              <strong>{user.displayName || 'APIVN user'}</strong>
              <span>{user.email}</span>
            </span>
          </div>
          <div className="sidebar-balance"><span>Số dư</span><strong>{user.balanceLabel}</strong></div>
          <form action="/auth/signout" method="post"><button type="submit" className="sidebar-signout">Đăng xuất</button></form>
        </div>
      </aside>

      <section className="tide-workspace">
        <header className="tide-mobile-header">
          <BrandLogo href="/dashboard" gradientId="apivn-mobile-gradient" />
          <Link href="/dashboard/account" className="mobile-balance">Số dư<strong>{user.balanceLabel}</strong></Link>
        </header>

        <header className="tide-topbar">
          <div className="topbar-context"><span>Console</span><TideIcon name="chevron" width={14} /><strong>{current?.label ?? 'APIVN.tech'}</strong></div>
          <div className="topbar-actions">
            <span className="topbar-status">APIVN console</span>
            <Link href="/dashboard/billing" className="btn">Nạp tiền</Link>
          </div>
        </header>

        <main className="tide-content">{children}</main>
      </section>

      <nav className="tide-mobile-nav" aria-label="Điều hướng nhanh">
        {mobileNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            activeOverride={item.href === '/dashboard/account'
              ? mobileMoreRoutes.some((href) => matchesPath(pathname, href))
              : undefined}
          />
        ))}
      </nav>
    </div>
  )
}
