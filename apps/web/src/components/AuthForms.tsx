'use client'

import React, { useState } from 'react'

export function LoginForm() {
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        setError(json.error || 'Email hoặc mật khẩu không chính xác')
        setLoading(false)
        return
      }

      // Đăng nhập thành công -> Chuyển vào Dashboard
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.')
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
  const [displayName, setDisplayName] = useState('')
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
      // 1. Tạo tài khoản & tự động confirm qua Admin API
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'Không thể tạo tài khoản')
        setLoading(false)
        return
      }

      // 2. Tự động đăng nhập vào session ngay lập tức
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })

      const loginJson = await loginRes.json()
      if (!loginRes.ok || loginJson.error) {
        // Nếu tạo xong nhưng cần chuyển qua trang login
        window.location.href = '/login'
        return
      }

      // 3. Chuyển thẳng vào Dashboard
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.')
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
          placeholder="ten@gmail.com"
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
        {loading ? 'Đang tạo tài khoản & đăng nhập...' : 'Tạo tài khoản & Bắt đầu ngay →'}
      </button>
    </form>
  )
}
