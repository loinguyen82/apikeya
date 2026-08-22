import Link from 'next/link'
import { SignupForm } from '@/components/AuthForms'
import { BrandLogo } from '@/components/BrandLogo'

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <BrandLogo gradientId="apivn-signup-aside-gradient" />
        <h1>Một tài khoản cho toàn bộ API workflow.</h1>
        <p>Tạo account, vào console, quản lý API key, chọn model, sinh cấu hình và theo dõi request trong cùng một nơi.</p>
        <div className="auth-benefits">
          <div className="auth-benefit">API key đầy đủ chỉ hiện đúng một lần</div>
          <div className="auth-benefit">Playground và logs dùng dữ liệu thật</div>
          <div className="auth-benefit">Checkout tạm thời mô phỏng, không cộng ví</div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <BrandLogo gradientId="apivn-signup-form-gradient" />
          <h2 className="auth-title" style={{ marginTop: 28 }}>Tạo tài khoản APIVN</h2>
          <p className="auth-subtitle">Sau khi đăng ký, bạn sẽ vào flow nạp tiền mô phỏng trước khi PayOS được kết nối.</p>
          <SignupForm />
          <div className="auth-foot">Đã có API key? <Link href="/login">Đăng nhập</Link></div>
        </div>
      </section>
    </main>
  )
}
