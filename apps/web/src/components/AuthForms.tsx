'use client'

import React, { useState } from 'react'

function PasswordField({ id, value, onChange, autoComplete, minLength }: { id: string; value: string; onChange: (value: string) => void; autoComplete: string; minLength?: number }) {
  const [show, setShow] = useState(false)
  return <div className="password-wrap"><input id={id} className="input" type={show ? 'text' : 'password'} minLength={minLength} placeholder="••••••••" value={value} onChange={(e) => onChange(e.target.value)} required autoComplete={autoComplete} /><button type="button" className="password-toggle" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow(!show)}>{show ? 'Ẩn' : 'Hiện'}</button></div>
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error || 'Email hoặc mật khẩu không chính xác'); setLoading(false); return }
      window.location.href = '/dashboard'
    } catch { setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.'); setLoading(false) }
  }

  return <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
    {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
    <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
    <div className="field"><label htmlFor="login-password">Mật khẩu</label><PasswordField id="login-password" value={password} onChange={setPassword} autoComplete="current-password" /></div>
    <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
  </form>
}

export function SignupForm() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setConfirmationSent(false); setResendMessage(null); setLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: displayName.trim(), email: normalizedEmail, password }) })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error || 'Không thể tạo tài khoản'); setLoading(false); return }
      if (json.requiresConfirmation) {
        setConfirmationSent(true)
        setLoading(false)
        return
      }
      window.location.href = '/dashboard'
    } catch { setError('Đã có lỗi xảy ra. Vui lòng thử lại.'); setLoading(false) }
  }

  async function resendConfirmation() {
    if (!email.trim()) return
    setResending(true); setError(null); setResendMessage(null)
    try {
      const res = await fetch('/api/auth/resend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase() }) })
      const json = await res.json()
      if (!res.ok || json.error) setError(json.error || 'Không thể gửi lại email xác minh')
      else setResendMessage('Đã gửi lại email xác minh.')
    } catch { setError('Không thể gửi lại email xác minh') } finally { setResending(false) }
  }

  if (confirmationSent) {
    return <div className="page-stack" style={{ gap: 14 }}>
      <div className="notice success" role="status"><strong>Kiểm tra email của bạn.</strong><br />Apikeya đã gửi link xác minh tới <strong>{email.trim().toLowerCase()}</strong>. Sau khi xác minh, quay lại đăng nhập.</div>
      {resendMessage && <div className="notice success" role="status">{resendMessage}</div>}
      {error && <div className="notice danger" role="alert">{error}</div>}
      <button className="btn secondary" type="button" disabled={resending} onClick={resendConfirmation}>{resending ? 'Đang gửi…' : 'Gửi lại email xác minh'}</button>
      <a className="btn" href="/login">Tới trang đăng nhập</a>
    </div>
  }

  return <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
    {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
    <div className="field"><label htmlFor="signup-name">Tên hiển thị</label><input id="signup-name" className="input" type="text" placeholder="Tên của bạn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></div>
    <div className="field"><label htmlFor="signup-email">Email</label><input id="signup-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
    <div className="field"><label htmlFor="signup-password">Mật khẩu</label><PasswordField id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} /><span className="field-hint">Tối thiểu 8 ký tự.</span></div>
    <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
  </form>
}
