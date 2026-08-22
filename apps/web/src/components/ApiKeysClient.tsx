'use client'

import React, { useState } from 'react'
import { formatVietnamDateTime } from '@/lib/date'
import { formatNumber } from '@/lib/money'

interface KeyItem {
  id: string
  name: string
  prefix: string
  last_four: string | null
  status: string
  last_used_at: string | null
  created_at: string
  request_count: number
}

function maskedKey(key: KeyItem) {
  return `${key.prefix}-••••••••••••••••••••${key.last_four || '••••'}`
}

export function ApiKeysClient({ initialKey }: { initialKey: KeyItem | null }) {
  const [key, setKey] = useState<KeyItem | null>(initialKey)
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech'

  async function request(body: unknown, method: 'POST' | 'PATCH') {
    const response = await fetch('/api/keys', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.error) throw new Error(result?.error || 'Không thể cập nhật API Key')
    return result
  }

  function acceptNewSecret(result: any, requestCount: number) {
    if (typeof result?.plaintext !== 'string' || !result?.key?.id) {
      throw new Error('Máy chủ không trả về secret mới')
    }
    setKey({ ...result.key, request_count: requestCount })
    setPlaintext(result.plaintext)
    setShowSecret(true)
    setCopied(false)
  }

  async function createKey() {
    setBusy(true)
    setErrorMsg(null)
    try {
      const result = await request({}, 'POST')
      acceptNewSecret(result, 0)
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể tạo API Key')
    } finally {
      setBusy(false)
    }
  }

  async function resetKey() {
    if (!key) return
    if (!window.confirm('Reset API Key? Key cũ sẽ ngừng hoạt động ngay và liên kết Telegram cũ cũng bị huỷ.')) return

    setBusy(true)
    setErrorMsg(null)
    try {
      const result = await request({ id: key.id, action: 'rotate' }, 'PATCH')
      acceptNewSecret(result, key.request_count)
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể reset API Key')
    } finally {
      setBusy(false)
    }
  }

  function toggleSecret() {
    if (!plaintext) {
      setErrorMsg('Full API Key không được lưu trên server. Key đầy đủ chỉ hiện ngay sau khi tạo hoặc reset; nếu đã mất key, hãy Reset API Key.')
      return
    }
    setShowSecret((value) => !value)
  }

  async function copySecret() {
    if (!plaintext) {
      setErrorMsg('Không thể copy full key vì server chỉ lưu hash. Hãy Reset API Key nếu bạn không còn bản đã lưu.')
      return
    }
    try {
      await navigator.clipboard.writeText(plaintext)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setErrorMsg('Trình duyệt chặn clipboard. Hãy sao chép key thủ công.')
    }
  }

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">API Key</div>
          <h1>Một key cho toàn bộ APIVN</h1>
          <p>Mỗi tài khoản chỉ có một API Key đang hoạt động. Dùng cùng key này cho mọi model và công cụ.</p>
        </div>
        <span className={`status-chip ${key ? 'success' : ''}`}>{key ? '1 key · Active' : 'Chưa có key'}</span>
      </header>

      {errorMsg && <div className="notice warning" role="alert">{errorMsg}</div>}

      {!key ? (
        <section className="surface surface-pad">
          <div className="empty-card">
            <div className="empty-icon">K</div>
            <strong>Chưa có API Key</strong>
            <p>Tạo một lần rồi dùng key đó cho toàn bộ APIVN. Hệ thống không cho tạo key thứ hai song song.</p>
            <button className="btn" type="button" disabled={busy} onClick={createKey}>
              {busy ? 'Đang tạo…' : 'Tạo API Key'}
            </button>
          </div>
        </section>
      ) : (
        <section className="surface surface-pad">
          <div className="page-head" style={{ marginBottom: 14 }}>
            <div>
              <div className="eyebrow">Master API Key</div>
              <h2 style={{ margin: '5px 0', fontSize: 19 }}>Credential duy nhất của tài khoản</h2>
            </div>
            <span className="status-chip success">Active</span>
          </div>

          <div className="secret-box">
            <div className="secret-value" style={{ minWidth: 0 }}>
              <small>Secret key</small>
              <code data-testid="api-key" style={{ overflowWrap: 'anywhere' }}>
                {plaintext && showSecret ? plaintext : maskedKey(key)}
              </code>
            </div>
            <div className="table-actions" style={{ flexShrink: 0 }}>
              <button className="btn secondary" type="button" onClick={toggleSecret} aria-label={showSecret ? 'Ẩn API Key' : 'Hiện API Key'}>
                {showSecret ? '🙈 Ẩn' : '👁 Hiện'}
              </button>
              <button className="btn secondary" type="button" onClick={copySecret}>
                {copied ? 'Đã copy' : 'Copy'}
              </button>
            </div>
          </div>

          {plaintext ? (
            <div className="notice warning" style={{ marginTop: 12 }}>
              <strong>Lưu key ngay.</strong> Full key chỉ tồn tại trong phiên trang này; reload xong APIVN chỉ còn hash để xác minh.
            </div>
          ) : (
            <p className="field-hint" style={{ marginTop: 10 }}>
              Vì lý do bảo mật, server không lưu plaintext. Sau khi rời màn hình tạo/reset, chỉ phần đầu và 4 ký tự cuối được hiển thị.
            </p>
          )}

          <div className="billing-grid" style={{ marginTop: 16 }}>
            <div className="subtle-panel">
              <span className="muted" style={{ fontSize: 11 }}>Requests</span>
              <strong style={{ display: 'block', marginTop: 4 }}>{formatNumber(key.request_count)}</strong>
            </div>
            <div className="subtle-panel">
              <span className="muted" style={{ fontSize: 11 }}>Last used</span>
              <strong style={{ display: 'block', marginTop: 4 }}>{key.last_used_at ? formatVietnamDateTime(key.last_used_at) : 'Chưa dùng'}</strong>
            </div>
          </div>

          <div className="page-head" style={{ marginTop: 18, marginBottom: 0 }}>
            <div className="muted" style={{ fontSize: 11 }}>
              Base URL: <code>{gatewayUrl}/v1</code>
            </div>
            <button className="btn secondary" type="button" disabled={busy} onClick={resetKey}>
              {busy ? 'Đang reset…' : 'Reset API Key'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
