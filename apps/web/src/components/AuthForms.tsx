'use client'

import React, { useState } from 'react'

function PasswordField({ id, value, onChange, autoComplete, minLength }: { id: string; value: string; onChange: (value: string) => void; autoComplete: string; minLength?: number }) {
  const [show, setShow] = useState(false)
  return <div className="password-wrap"><input id={id} className="input" type={show ? 'text' : 'password'} minLength={minLength} placeholder="••••••••" value={value} onChange={(e) => onChange(e.target.value)} required autoComplete={autoComplete} /><button type="button" className="password-toggle" aria-label={show ? 'Ẩn' : 'Hiện'} onClick={() => setShow(!show)}>{show ? 'Ẩn' : 'Hiện'}</button></div>
}

export function LoginForm() {
  const [apiKey, setApiKey] = useState('')
  const [legacy, setLegacy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true)
    try {
      const body = legacy ? { email: email.trim().toLowerCase(), password } : { apiKey: apiKey.trim() }
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || (legacy ? 'Email hoặc mật khẩu không chính xác' : 'API key không hợp lệ'))
        setLoading(false)
        return
      }
      window.location.href = '/dashboard'
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  return <div className="page-stack" style={{ gap: 14 }}>
    <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
      {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
      {!legacy ? <>
        <div className="field">
          <label htmlFor="login-api-key">API key</label>
          <input id="login-api-key" className="input" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} required autoComplete="off" spellCheck={false} />
          <span className="field-hint">Dùng chính API key đang hoạt động để mở Developer Console.</span>
        </div>
        <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang xác thực…' : 'Vào Dashboard'}</button>
      </> : <>
        <div className="notice" role="status">Dùng email và mật khẩu nếu bạn chưa có hoặc đã làm mất API key.</div>
        <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
        <div className="field"><label htmlFor="login-password">Mật khẩu</label><PasswordField id="login-password" value={password} onChange={setPassword} autoComplete="current-password" /></div>
        <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang đăng nhập…' : 'Tiếp tục bằng email'}</button>
      </>}
    </form>
    <button className="btn secondary" type="button" onClick={() => { setLegacy(!legacy); setError(null) }}>
      {legacy ? '← Dùng API key' : 'Đăng nhập bằng email'}
    </button>
  </div>
}

export function SignupForm() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), email: email.trim().toLowerCase(), password }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'Không thể tạo tài khoản')
        setLoading(false)
        return
      }
      window.location.href = '/dashboard/billing?welcome=1'
    } catch {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  return <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
    {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
    <div className="field"><label htmlFor="signup-name">Tên hiển thị</label><input id="signup-name" className="input" type="text" placeholder="Tên của bạn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></div>
    <div className="field"><label htmlFor="signup-email">Email</label><input id="signup-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /><span className="field-hint">Dùng để đăng nhập và khôi phục quyền truy cập khi chưa có API key.</span></div>
    <div className="field"><label htmlFor="signup-password">Mật khẩu</label><PasswordField id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} /><span className="field-hint">Tối thiểu 8 ký tự. API key được quản lý riêng trong console.</span></div>
    <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
  </form>
}
