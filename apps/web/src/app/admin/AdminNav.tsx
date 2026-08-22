'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './AdminLayout.module.css'

const items = [
  { href: '/admin', label: 'Tổng quan' },
  { href: '/admin/topups', label: 'Nạp tiền' },
  { href: '/admin/models', label: 'Models & routing' },
  { href: '/admin/requests', label: 'Requests' },
]

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className={styles.nav} aria-label="Điều hướng quản trị">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={isActive(pathname, item.href) ? styles.active : undefined}
          aria-current={isActive(pathname, item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
