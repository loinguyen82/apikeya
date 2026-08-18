import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI API — Nền tảng AI Gateway & Reseller cho Việt Nam',
  description: 'Một cổng API duy nhất kết nối nhiều mô hình AI hàng đầu (Claude, GPT, Kimi). Thanh toán thuận tiện bằng VNĐ.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
