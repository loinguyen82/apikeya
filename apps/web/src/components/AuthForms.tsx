'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function translateError(err: string): string {
  if (!err) return 'Đã có lỗi xảy ra. Vui lòng thử lại.'
  if (err.includes('Invalid login credentials')) return 'Email hoặc mật khẩu không chính xác.'
  if (err.includes('User already registered')) return 'Email này đã được đăng ký. Hãy đăng nhập.'
  if (err.includes('Password should be at least')) return 'Mật khẩu cần tối thiểu 6 ký tự.'
  if (err.includes('Email not confirmed')) return 'Vui lòng kiểm tra email để xác nhận tài khoản trước khi đăng nhập.'
  if (err.includes('rate limit')) return 'Thao tác quá nhanh. Vui lòng đợi 30 giây rồi thử lại.'
  return err
}

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = getSupabase()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        setError(translateError(authError.message))
        setLoading(false)
        return
      }

      if (data?.user) {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: any) {
      setError(translateError(err.message))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ gap: '16px' }}>
      {error && (
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
          {error}
        </div>
      )}

      <div>
        <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          Địa chỉ Email
        </label>
        <input
          className="input"
          type="email"
          placeholder="loi822004@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          Mật khẩu
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ paddingRight: '45px' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--text-muted)',
            }}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      <button className="btn" type="submit" disabled={loading} style={{ marginTop: '8px', width: '100%' }}>
        {loading ? 'Đang đăng nhập...' : 'Đăng nhập →'}
      </button>
    </form>
  )
}

export function SignupForm() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      const supabase = getSupabase()
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
          },
        },
      })

      if (authError) {
        setError(translateError(authError.message))
        setLoading(false)
        return
      }

      if (data?.session) {
        // Đăng nhập thành công ngay lập tức
        router.push('/dashboard')
        router.refresh()
      } else if (data?.user) {
        // Tài khoản đã tạo, thông báo cho user
        setSuccessMsg('🎉 Tạo tài khoản thành công! Đang chuyển hướng vào bảng điều khiển...')
        setTimeout(() => {
          router.push('/login')
          router.refresh()
        }, 1500)
      }
    } catch (err: any) {
      setError(translateError(err.message))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ gap: '16px' }}>
      {error && (
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
          {error}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: 'var(--success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--success)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '14px',
          }}
        >
          {successMsg}
        </div>
      )}

      <div>
        <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          Tên hiển thị
        </label>
        <input
          className="input"
          type="text"
          placeholder="Lợi Nguyễn"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </div>

      <div>
        <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          Địa chỉ Email
        </label>
        <input
          className="input"
          type="email"
          placeholder="loi822004@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          Mật khẩu (tối thiểu 6 ký tự)
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            type={showPassword ? 'text' : 'password'}
            minLength={6}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            style={{ paddingRight: '45px' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--text-muted)',
            }}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      <button className="btn" type="submit" disabled={loading} style={{ marginTop: '8px', width: '100%' }}>
        {loading ? 'Đang khởi tạo tài khoản...' : 'Tạo tài khoản & Bắt đầu →'}
      </button>
    </form>
  )
}
