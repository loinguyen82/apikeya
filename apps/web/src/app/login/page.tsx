import Link from 'next/link'
import { LoginForm } from '@/components/AuthForms'

export default function LoginPage() {
  return (
    <main className="container" style={{ maxWidth: 440, paddingTop: 80, paddingBottom: 80 }}>
      <div className="card stack">
        <div className="stack" style={{ gap: '6px' }}>
          <div className="brand" style={{ marginBottom: '8px' }}>
            <span>⚡</span>
            <span>AI API</span>
          </div>
          <h1>Đăng nhập</h1>
          <p className="muted">Truy cập bảng điều khiển để dùng thử, nạp tiền và tạo API key.</p>
        </div>

        <LoginForm />

        <div className="row" style={{ justifyContent: 'center', fontSize: '14px', marginTop: '8px' }}>
          <span className="muted">Chưa có tài khoản?</span>
          <Link href="/signup" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Tạo tài khoản mới
          </Link>
        </div>
      </div>
    </main>
  )
}
