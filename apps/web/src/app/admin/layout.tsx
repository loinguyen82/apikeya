import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { BrandLogo } from '@/components/BrandLogo'
import { AdminNav } from './AdminNav'
import styles from './AdminLayout.module.css'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <div className={styles.brand}>
            <BrandLogo href="/admin" gradientId="apivn-admin-gradient" />
            <span className={styles.adminBadge}>Admin</span>
          </div>

          <AdminNav />

          <Link href="/dashboard" className={styles.customerLink}>
            Customer console
          </Link>
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
