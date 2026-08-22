import './globals.css'
import './refresh.css'
import './product.css'
import './compat.css'
import './tide.css'
import type { Metadata } from 'next'

const siteName = 'APIVN.tech'
const siteTitle = 'APIVN.tech — API AI nhiều model, thanh toán VNĐ'
const siteDescription = 'API AI tương thích OpenAI cho Claude, GPT, Kimi và DeepSeek. Một Base URL, một API Key, bảng giá theo token và thanh toán bằng VNĐ.'

export const metadata: Metadata = {
  metadataBase: new URL('https://apivn.tech'),
  applicationName: siteName,
  title: {
    default: siteTitle,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  category: 'technology',
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName,
    url: 'https://apivn.tech/',
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: 'summary',
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
