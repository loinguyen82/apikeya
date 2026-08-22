import Link from 'next/link'
import { LoginForm } from '@/components/AuthForms'
import { BrandLogo } from '@/components/BrandLogo'

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <BrandLogo gradientId="apivn-login-aside-gradient" />
        <h1>Quay lại developer console.</h1>
        <p>Đăng nhập nhanh bằng API key, hoặc dùng email và mật khẩu nếu bạn chưa có key.</p>
        <div className="auth-benefits">
          <div className="auth-benefit">API key được hash, không lưu plaintext</div>
          <div className="auth-benefit">Wallet và lịch sử request đi theo tài khoản</div>
          <div className="auth-benefit">Rotate key không làm mất usage hoặc số dư</div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <BrandLogo gradientId="apivn-login-form-gradient" />
          <h2 className="auth-title" style={{ marginTop: 28 }}>Đăng nhập APIVN</h2>
          <p className="auth-subtitle">Dán key dạng <code>sk-...</code> để mở console.</p>
          <LoginForm />
          <div className="auth-foot">Chưa có tài khoản? <Link href="/signup">Tạo tài khoản</Link></div>
        </div>
      </section>
    </main>
  )
}
