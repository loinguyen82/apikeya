import Link from 'next/link'
import { SignupForm } from '@/components/AuthForms'

export default function SignupPage() {
  return <main className="auth-page">
    <section className="auth-aside">
      <Link href="/" className="landing-brand"><span className="brand-mark">A</span><span>Apikeya</span></Link>
      <h1>Bắt đầu với API gateway trong vài phút.</h1>
      <p>Tạo tài khoản, thử model trong Playground rồi sinh API key khi bạn sẵn sàng tích hợp.</p>
      <div className="auth-benefits"><div className="auth-benefit">Không cần cấu hình phức tạp để dùng thử</div><div className="auth-benefit">Một Base URL cho nhiều model</div><div className="auth-benefit">Nạp và theo dõi chi phí bằng VNĐ</div></div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <Link href="/" className="auth-brand"><span className="brand-mark">A</span>Apikeya</Link>
      <h2 className="auth-title">Tạo tài khoản</h2><p className="auth-subtitle">Thiết lập tài khoản developer của bạn.</p>
      <SignupForm />
      <div className="auth-foot">Đã có tài khoản? <Link href="/login">Đăng nhập</Link></div>
    </div></section>
  </main>
}
