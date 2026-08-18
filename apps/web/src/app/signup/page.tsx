import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  async function signUp(formData: FormData) {
    'use server'
    const email = String(formData.get('email') || '').trim()
    const password = String(formData.get('password') || '')
    const displayName = String(formData.get('displayName') || '').trim()
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    })
    if (!error) {
      redirect('/dashboard')
    }
    redirect('/signup?error=' + encodeURIComponent(error.message))
  }

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
            {params.error}
          </div>
        )}

        <form action={signUp} className="stack">
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Tên hiển thị
            </label>
            <input className="input" name="displayName" type="text" placeholder="Nguyễn Văn A" required />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Địa chỉ Email
            </label>
            <input className="input" name="email" type="email" placeholder="ten@congty.com" required />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Mật khẩu (tối thiểu 8 ký tự)
            </label>
            <input className="input" name="password" type="password" minLength={8} placeholder="••••••••" required />
          </div>
          <button className="btn" type="submit" style={{ marginTop: '8px', width: '100%' }}>
            Tạo tài khoản & Bắt đầu →
          </button>
        </form>

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
