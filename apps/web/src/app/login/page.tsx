import Link from 'next/link'
import { LoginForm } from '@/components/AuthForms'

export default function LoginPage() {
  return <main className="auth-page">
    <section className="auth-aside">
      <Link href="/" className="landing-brand"><span className="brand-mark">A</span><span>Apikeya</span></Link>
      <h1>Dùng chính API key để vào Dashboard.</h1>
      <p>Một credential cho cả Developer Console và API. Không cần chờ email xác minh, không có free credit để farm tài khoản.</p>
      <div className="auth-benefits"><div className="auth-benefit">API key được hash, không lưu plaintext</div><div className="auth-benefit">Một user chỉ có một key active</div><div className="auth-benefit">Quota và số dư gắn wallet, không gắn key</div></div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <Link href="/" className="auth-brand"><span className="brand-mark">A</span>Apikeya</Link>
      <h2 className="auth-title">Đăng nhập bằng API key</h2><p className="auth-subtitle">Dán key dạng <code>sk-...</code> để mở Developer Console.</p>
      <LoginForm />
      <div className="auth-foot">Chưa có API key? <Link href="/signup">Tạo tài khoản & nhận key</Link></div>
    </div></section>
  </main>
}
