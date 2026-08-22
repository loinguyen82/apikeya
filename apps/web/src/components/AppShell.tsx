'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from './BrandLogo'
import { TideIcon } from './TideIcon'

type IconName = Parameters<typeof TideIcon>[0]['name']
type NavItem = { href: string; label: string; icon: IconName }

const consoleNav: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: 'overview' },
  { href: '/dashboard/models', label: 'Models', icon: 'models' },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: 'key' },
  { href: '/dashboard/hexa', label: 'Hexa', icon: 'play' },
  { href: '/dashboard/quota', label: 'Quota', icon: 'usage' },
  { href: '/dashboard/billing', label: 'Billing', icon: 'billing' },
  { href: '/docs', label: 'Docs', icon: 'docs' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'user' },
]

function matchesPath(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = matchesPath(pathname, item.href)
  return <Link href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><TideIcon name={item.icon} /><span>{item.label}</span></Link>
}

export function AppShell({ children, user }: { children: ReactNode; user: { displayName: string; email: string; balanceLabel: string; isAdmin: boolean } }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const current = consoleNav.find((item) => matchesPath(pathname, item.href))
  const initial = (user.displayName || user.email || 'A').trim().slice(0, 1).toUpperCase()

  useEffect(() => setDrawerOpen(false), [pathname])
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const sidebar = <><div className="tide-sidebar-brand"><BrandLogo href="/dashboard" gradientId="apivn-sidebar-gradient" /></div><nav className="tide-nav" aria-label="Điều hướng Developer Console"><div className="tide-nav-label">Developer Console</div>{consoleNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}{user.isAdmin && <NavLink item={{ href: '/admin', label: 'Admin', icon: 'admin' }} pathname={pathname} />}</nav><div className="tide-sidebar-foot"><div className="sidebar-profile"><span className="sidebar-avatar">{initial}</span><span><strong>{user.displayName || 'APIVN user'}</strong><span>{user.email}</span></span></div><div className="sidebar-balance"><span>Số dư</span><strong>{user.balanceLabel}</strong></div><form action="/auth/signout" method="post"><button type="submit" className="sidebar-signout">Đăng xuất</button></form></div></>

  return (
    <div className="tide-shell">
      <aside className="tide-sidebar">{sidebar}</aside>
      <section className="tide-workspace">
        <header className="tide-mobile-header"><button className="mobile-menu-button" type="button" aria-label="Mở menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><span /><span /><span /></button><BrandLogo href="/dashboard" gradientId="apivn-mobile-gradient" /><Link href="/dashboard/billing" className="mobile-balance">Số dư<strong>{user.balanceLabel}</strong></Link></header>
        <header className="tide-topbar"><div className="topbar-context"><span>Console</span><TideIcon name="chevron" width={14} /><strong>{current?.label ?? 'APIVN.tech'}</strong></div><div className="topbar-actions"><span className="topbar-status">api.apivn.tech/v1</span><Link href="/dashboard/billing" className="btn">Nạp tiền</Link></div></header>
        <main className="tide-content">{children}</main>
      </section>
      {drawerOpen && <button type="button" className="mobile-drawer-backdrop" aria-label="Đóng menu" onClick={() => setDrawerOpen(false)} />}
      <aside className={`mobile-drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}><button className="mobile-drawer-close" type="button" aria-label="Đóng menu" onClick={() => setDrawerOpen(false)}>×</button>{sidebar}</aside>
    </div>
  )
}
