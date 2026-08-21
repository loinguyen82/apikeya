import Link from 'next/link'
import { SignupForm } from '@/components/AuthForms'

export default function SignupPage() {
  return <main className="auth-page">
    <section className="auth-aside">
      <Link href="/" className="landing-brand"><span className="brand-mark">A</span><span>Apikeya</span></Link>
      <h1>Tạo tài khoản, nạp tiền rồi nhận API key.</h1>
      <p>Không cần xác minh email. Tài khoản mới có 0 Credit; API key đầu tiên chỉ mở sau khi tiền đã được cộng vào wallet.</p>
      <div className="auth-benefits"><div className="auth-benefit">Không free credit để farm nhiều tài khoản</div><div className="auth-benefit">Nạp thành công mới mở API key đầu tiên</div><div className="auth-benefit">Sau đó dùng key cho cả API và Dashboard</div></div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <Link href="/" className="auth-brand"><span className="brand-mark">A</span>Apikeya</Link>
      <h2 className="auth-title">Bắt đầu với Apikeya</h2><p className="auth-subtitle">Email và mật khẩu là đường khôi phục; sau khi nạp tiền bạn sẽ chuyển sang đăng nhập bằng API key.</p>
      <SignupForm />
      <div className="auth-foot">Đã có API key? <Link href="/login">Đăng nhập</Link></div>
    </div></section>
  </main>
}
