'use client'

import React, { useState } from 'react'

function PasswordField({ id, value, onChange, autoComplete, minLength }: { id: string; value: string; onChange: (value: string) => void; autoComplete: string; minLength?: number }) {
  const [show, setShow] = useState(false)
  return (
    <div className="password-wrap">
      <input id={id} className="input" type={show ? 'text' : 'password'} minLength={minLength} placeholder="••••••••" value={value} onChange={(event) => onChange(event.target.value)} required autoComplete={autoComplete} />
      <button type="button" className="password-toggle" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow(!show)}>{show ? 'Ẩn' : 'Hiện'}</button>
    </div>
  )
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.error) {
        setError(result?.error || 'Email hoặc mật khẩu không chính xác')
        return
      }
      window.location.assign('/dashboard')
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
      {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
      <div className="field">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="login-password">Mật khẩu</label>
        <PasswordField id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
      </div>
      <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
  )
}

export function SignupForm() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), email: email.trim().toLowerCase(), password }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.error) {
        setError(result?.error || 'Không thể tạo tài khoản')
        return
      }
      window.location.assign('/dashboard')
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
      {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
      <div className="field"><label htmlFor="signup-name">Tên hiển thị</label><input id="signup-name" className="input" type="text" placeholder="Tên của bạn" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required autoComplete="name" /></div>
      <div className="field"><label htmlFor="signup-email">Email</label><input id="signup-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /><span className="field-hint">Email dùng để đăng nhập Developer Console.</span></div>
      <div className="field"><label htmlFor="signup-password">Mật khẩu</label><PasswordField id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} /><span className="field-hint">Tối thiểu 8 ký tự. API Key được quản lý riêng trong console.</span></div>
      <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
    </form>
  )
}
