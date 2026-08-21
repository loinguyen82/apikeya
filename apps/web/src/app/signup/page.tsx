import Link from 'next/link'
import { SignupForm } from '@/components/AuthForms'

export default function SignupPage() {
  return <main className="auth-page">
    <section className="auth-aside">
      <Link href="/" className="landing-brand"><span className="brand-mark">A</span><span>Apikeya</span></Link>
      <h1>Tạo tài khoản và nhận API key ngay.</h1>
      <p>Không cần xác minh email. Tài khoản mới có 0 Credit, nhận một API key active rồi nạp từ 20.000đ để bắt đầu dùng.</p>
      <div className="auth-benefits"><div className="auth-benefit">Không free credit để farm nhiều tài khoản</div><div className="auth-benefit">API key chỉ hiển thị một lần khi tạo</div><div className="auth-benefit">Nạp và theo dõi chi phí bằng VNĐ</div></div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <Link href="/" className="auth-brand"><span className="brand-mark">A</span>Apikeya</Link>
      <h2 className="auth-title">Nhận API key</h2><p className="auth-subtitle">Email và mật khẩu chỉ dùng cho recovery; đăng nhập hằng ngày bằng API key.</p>
      <SignupForm />
      <div className="auth-foot">Đã có API key? <Link href="/login">Đăng nhập</Link></div>
    </div></section>
  </main>
}
