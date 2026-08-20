import './globals.css'
import './refresh.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Apikeya — Một API cho nhiều model AI',
  description: 'Dùng Claude, GPT, Kimi và DeepSeek qua một Base URL. Thanh toán bằng VNĐ, theo dõi request và chi phí trong một developer console.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
