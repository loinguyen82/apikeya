import './globals.css'
import './refresh.css'
import './product.css'
import './compat.css'
import './tide.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'APIVN.tech — Một API cho mọi model AI',
  description: 'Dùng Claude, GPT, Kimi và DeepSeek qua một Base URL. Quản lý API key, model, cấu hình và request trong một developer console.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
