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
      const body = legacy
        ? { email: email.trim().toLowerCase(), password }
        : { apiKey: apiKey.trim() }
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
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
          <span className="field-hint">Dùng chính API key gọi model để vào Developer Console.</span>
        </div>
        <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang xác thực…' : 'Vào Dashboard'}</button>
      </> : <>
        <div className="notice" role="status">Chỉ dành cho tài khoản cũ chưa lưu API key. Sau khi vào Dashboard, hãy tạo/rotate key và dùng key cho các lần đăng nhập sau.</div>
        <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
        <div className="field"><label htmlFor="login-password">Mật khẩu</label><PasswordField id="login-password" value={password} onChange={setPassword} autoComplete="current-password" /></div>
        <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang đăng nhập…' : 'Đăng nhập cũ'}</button>
      </>}
    </form>
    <button className="btn secondary" type="button" onClick={() => { setLegacy(!legacy); setError(null) }}>
      {legacy ? '← Dùng API key' : 'Tài khoản cũ chưa có key?'}
    </button>
  </div>
}

export function SignupForm() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
      if (json.plaintext) {
        setIssuedKey(json.plaintext)
        setLoading(false)
        return
      }
      window.location.href = '/dashboard/api-keys'
    } catch {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  async function copyKey() {
    if (!issuedKey) return
    await navigator.clipboard.writeText(issuedKey)
    setCopied(true)
  }

  if (issuedKey) {
    return <div className="page-stack" style={{ gap: 14 }}>
      <div className="notice success" role="status"><strong>API key của bạn đã sẵn sàng.</strong><br />Apikeya không gửi email xác minh. Hãy lưu key này ngay; secret chỉ hiển thị ở bước này.</div>
      <div className="secret-box"><code>{issuedKey}</code></div>
      <button className="btn secondary" type="button" onClick={copyKey}>{copied ? 'Đã sao chép' : 'Sao chép API key'}</button>
      <a className="btn" href="/dashboard/billing">Tiếp tục nạp tiền</a>
    </div>
  }

  return <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
    {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
    <div className="field"><label htmlFor="signup-name">Tên hiển thị</label><input id="signup-name" className="input" type="text" placeholder="Tên của bạn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></div>
    <div className="field"><label htmlFor="signup-email">Email khôi phục</label><input id="signup-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /><span className="field-hint">Không cần xác minh email để bắt đầu.</span></div>
    <div className="field"><label htmlFor="signup-password">Mật khẩu khôi phục</label><PasswordField id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} /><span className="field-hint">Chỉ dùng khi cần khôi phục tài khoản cũ; đăng nhập hằng ngày bằng API key.</span></div>
    <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang tạo API key…' : 'Tạo tài khoản & API key'}</button>
  </form>
}
