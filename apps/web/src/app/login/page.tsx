import Link from 'next/link'
import { LoginForm } from '@/components/AuthForms'
import { BrandLogo } from '@/components/BrandLogo'

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <BrandLogo gradientId="apivn-login-aside-gradient" />
        <h1>Quay lại Developer Console.</h1>
        <p>Đăng nhập bằng account để quản lý key, số dư và usage tại một nơi.</p>
        <div className="auth-benefits">
          <div className="auth-benefit">Account là danh tính đăng nhập Dashboard</div>
          <div className="auth-benefit">API Key chỉ dùng để gọi gateway</div>
          <div className="auth-benefit">Mọi key dùng chung wallet của account</div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <BrandLogo gradientId="apivn-login-form-gradient" />
          <h2 className="auth-title" style={{ marginTop: 28 }}>Đăng nhập APIVN</h2>
          <p className="auth-subtitle">Dùng email và mật khẩu của tài khoản APIVN.</p>
          <LoginForm />
          <div className="auth-foot">Chưa có tài khoản? <Link href="/signup">Tạo tài khoản</Link></div>
        </div>
      </section>
    </main>
  )
}
