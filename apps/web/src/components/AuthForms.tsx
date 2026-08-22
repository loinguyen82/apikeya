'use client'

import React, { useState } from 'react'

const API_KEY_SESSION_STORAGE_KEY = 'apivn.portal.apiKey'

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
  const [apiKey, setApiKey] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const normalizedApiKey = apiKey.trim()
      const body = recoveryMode
        ? { email: email.trim().toLowerCase(), password }
        : { apiKey: normalizedApiKey }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.error) {
        setError(result?.error || (recoveryMode ? 'Email hoặc mật khẩu không chính xác' : 'API Key không hợp lệ'))
        return
      }

      try {
        if (recoveryMode) window.sessionStorage.removeItem(API_KEY_SESSION_STORAGE_KEY)
        else window.sessionStorage.setItem(API_KEY_SESSION_STORAGE_KEY, normalizedApiKey)
      } catch {
        // Login still succeeds when browser storage is unavailable.
      }

      window.location.assign('/dashboard')
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-stack" style={{ gap: 14 }}>
      <form onSubmit={handleSubmit} className="page-stack" style={{ gap: 15 }}>
        {error && <div className="notice danger" role="alert" aria-live="assertive">{error}</div>}
        {!recoveryMode ? (
          <>
            <div className="field">
              <label htmlFor="login-api-key">API Key</label>
              <input id="login-api-key" className="input" type="password" placeholder="sk-apivn-..." value={apiKey} onChange={(event) => setApiKey(event.target.value)} required autoComplete="off" spellCheck={false} />
              <span className="field-hint">Dùng chính Master API Key gọi model để đăng nhập Developer Console. Key chỉ được giữ trong phiên tab hiện tại, không lưu vào localStorage.</span>
            </div>
            <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang xác thực…' : 'Vào Dashboard'}</button>
          </>
        ) : (
          <>
            <div className="notice" role="status">Dùng email và mật khẩu khi bạn chưa có hoặc đã làm mất API Key.</div>
            <div className="field">
              <label htmlFor="login-email">Email khôi phục</label>
              <input id="login-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="login-password">Mật khẩu khôi phục</label>
              <PasswordField id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
            </div>
            <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang đăng nhập…' : 'Tiếp tục bằng tài khoản'}</button>
          </>
        )}
      </form>
      <button className="btn secondary" type="button" onClick={() => { setRecoveryMode((value) => !value); setError(null) }}>
        {recoveryMode ? '← Dùng API Key' : 'Chưa có hoặc mất API Key?'}
      </button>
    </div>
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
      <div className="field"><label htmlFor="signup-email">Email khôi phục</label><input id="signup-email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /><span className="field-hint">Dùng để khôi phục truy cập nếu bạn chưa có hoặc làm mất API Key.</span></div>
      <div className="field"><label htmlFor="signup-password">Mật khẩu khôi phục</label><PasswordField id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} /><span className="field-hint">Tối thiểu 8 ký tự. Sau khi có Master API Key, bạn đăng nhập hằng ngày bằng key.</span></div>
      <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: 3 }}>{loading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
    </form>
  )
}
