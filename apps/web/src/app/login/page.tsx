import Link from 'next/link'
import { LoginForm } from '@/components/AuthForms'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string }> }) {
  const params = await searchParams
  return <main className="auth-page">
    <section className="auth-aside">
      <Link href="/" className="landing-brand"><span className="brand-mark">A</span><span>Apikeya</span></Link>
      <h1>Một API key cho nhiều model.</h1>
      <p>Quản lý model, request, số dư và khóa truy cập trong một developer console gọn nhẹ.</p>
      <div className="auth-benefits"><div className="auth-benefit">OpenAI-compatible cho SDK và code agent</div><div className="auth-benefit">Nạp từ 20.000đ qua VietQR</div><div className="auth-benefit">Theo dõi chi phí theo từng request</div></div>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <Link href="/" className="auth-brand"><span className="brand-mark">A</span>Apikeya</Link>
      <h2 className="auth-title">Đăng nhập</h2><p className="auth-subtitle">Tiếp tục vào developer console.</p>
      {params.verified === '1' && <div className="notice success" style={{ marginBottom: 14 }}>Email đã được xác minh. Bạn có thể đăng nhập.</div>}
      <LoginForm />
      <div className="auth-foot">Chưa có tài khoản? <Link href="/signup">Tạo tài khoản</Link></div>
    </div></section>
  </main>
}
