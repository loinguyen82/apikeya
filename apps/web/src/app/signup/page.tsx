import Link from 'next/link'
import { SignupForm } from '@/components/AuthForms'

export default function SignupPage() {
  return (
    <main className="container" style={{ maxWidth: 440, paddingTop: 80, paddingBottom: 80 }}>
      <div className="card stack">
        <div className="stack" style={{ gap: '6px' }}>
          <div className="brand" style={{ marginBottom: '8px' }}>
            <span>⚡</span>
            <span>AI API</span>
          </div>
          <h1>Tạo tài khoản</h1>
          <p className="muted">Bắt đầu dùng thử miễn phí và nạp VNĐ khi sẵn sàng.</p>
        </div>

        <SignupForm />

        <div className="row" style={{ justifyContent: 'center', fontSize: '14px', marginTop: '8px' }}>
          <span className="muted">Đã có tài khoản?</span>
          <Link href="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </main>
  )
}
