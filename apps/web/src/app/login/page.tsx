import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  async function signIn(formData: FormData) {
    'use server'
    const email = String(formData.get('email') || '').trim()
    const password = String(formData.get('password') || '')
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      redirect('/dashboard')
    }
    redirect('/login?error=invalid_credentials')
  }

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

        {params.error && (
          <div
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--danger)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
            }}
          >
            Email hoặc mật khẩu không chính xác. Vui lòng thử lại.
          </div>
        )}

        <form action={signIn} className="stack">
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Địa chỉ Email
            </label>
            <input className="input" name="email" type="email" placeholder="ten@congty.com" required />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Mật khẩu
            </label>
            <input className="input" name="password" type="password" placeholder="••••••••" required />
          </div>
          <button className="btn" type="submit" style={{ marginTop: '8px', width: '100%' }}>
            Đăng nhập →
          </button>
        </form>

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
