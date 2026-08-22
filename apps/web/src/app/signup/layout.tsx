import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Đăng ký',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
