'use client'

import React, { useEffect, useState } from 'react'
import { formatVietnamDate, formatVietnamDateTime } from '@/lib/date'

const API_KEY_SESSION_STORAGE_KEY = 'apivn.portal.apiKey'
const PUBLIC_BASE_URL = 'https://api.apivn.tech/v1'

interface KeyItem {
  id: string
  name: string
  prefix: string
  status: string
  last_used_at: string | null
  created_at: string
}

export function ApiKeysClient({ initialKeys }: { initialKeys: KeyItem[] }) {
  const [keys, setKeys] = useState<KeyItem[]>(initialKeys)
  const [creating, setCreating] = useState(false)
  const [sessionKey, setSessionKey] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [freshKey, setFreshKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const activeKey = keys.find((key) => key.status === 'active')
  const hasSessionKey = Boolean(sessionKey && activeKey && sessionKey.startsWith(activeKey.prefix))
  const maskedKey = activeKey ? `${activeKey.prefix}${'•'.repeat(24)}` : 'Chưa có API key'
  const displayedKey = showSecret && hasSessionKey ? sessionKey! : maskedKey

  useEffect(() => {
    try {
      if (!activeKey) {
        window.sessionStorage.removeItem(API_KEY_SESSION_STORAGE_KEY)
        setSessionKey(null)
        return
      }

      const stored = window.sessionStorage.getItem(API_KEY_SESSION_STORAGE_KEY)
      if (stored && stored.startsWith(activeKey.prefix)) {
        setSessionKey(stored)
      } else {
        if (stored) window.sessionStorage.removeItem(API_KEY_SESSION_STORAGE_KEY)
        setSessionKey(null)
      }
    } catch {
      setSessionKey(null)
    }
  }, [activeKey?.id, activeKey?.prefix])

  async function handleCreateOrReset() {
    if (activeKey && !confirm('Reset API Key? Key hiện tại sẽ bị thu hồi ngay và mọi app đang dùng key cũ sẽ ngừng truy cập.')) return

    setCreating(true)
    setErrorMsg(null)
    setCopyError(false)
    setFreshKey(false)

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Master API Key' }),
      })
      const json = await res.json()

      if (!res.ok || json.error) {
        setErrorMsg(json.error || 'Không thể tạo API key')
        return
      }

      const plaintext = String(json.plaintext || '')
      const nextKey: KeyItem = {
        id: json.key.id,
        name: json.key.name || 'Master API Key',
        prefix: json.key.prefix,
        status: 'active',
        last_used_at: null,
        created_at: json.key.created_at || new Date().toISOString(),
      }

      setKeys([
        nextKey,
        ...keys.map((key) => key.status === 'active' ? { ...key, status: 'revoked' } : key),
      ])
      setSessionKey(plaintext)
      setShowSecret(true)
      setFreshKey(true)

      try {
        window.sessionStorage.setItem(API_KEY_SESSION_STORAGE_KEY, plaintext)
      } catch {
        // The freshly generated key remains visible in React state for this page.
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ')
    } finally {
      setCreating(false)
    }
  }

  function handleToggleSecret() {
    setErrorMsg(null)
    if (!activeKey) return
    if (!hasSessionKey) {
      setShowSecret(false)
      setErrorMsg('Full API key không còn trong phiên này. Hãy đăng nhập lại bằng API key hiện tại, hoặc Reset API Key nếu bạn đã mất key.')
      return
    }
    setShowSecret((value) => !value)
  }

  async function handleCopyKey() {
    setCopyError(false)
    setErrorMsg(null)
    if (!hasSessionKey || !sessionKey) {
      setErrorMsg('Không thể copy full key vì key không còn trong phiên hiện tại. Hãy đăng nhập lại bằng key hoặc Reset API Key.')
      return
    }

    try {
      await navigator.clipboard.writeText(sessionKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">API key</div>
          <h1>Một key cho toàn bộ APIVN</h1>
          <p>Dùng cùng API key này cho mọi model, công cụ và để đăng nhập Developer Console.</p>
        </div>
        <span className={`status-chip ${activeKey ? 'success' : ''}`}>{activeKey ? '1 key · Active' : '0 key'}</span>
      </header>

      {errorMsg && <div className="notice danger" role="alert">{errorMsg}</div>}
      {freshKey && (
        <div className="notice success" role="status">
          API key mới đã active. Key cũ đã bị thu hồi. Hãy copy key mới trước khi kết thúc phiên đăng nhập này.
        </div>
      )}

      <section className="surface surface-pad">
        <div className="surface-head" style={{ padding: 0, marginBottom: 14 }}>
          <div>
            <div className="eyebrow">API key mới nhất</div>
            <h3 style={{ margin: '6px 0 4px' }}>Master API Key</h3>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Credential duy nhất của tài khoản.</p>
          </div>
          {activeKey && <span className="status-chip success">Active</span>}
        </div>

        {activeKey ? (
          <>
            <div className="secret-box">
              <code>{displayedKey}</code>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn secondary" type="button" onClick={handleToggleSecret}>{showSecret && hasSessionKey ? 'Ẩn' : '👁 Hiện'}</button>
                <button className="btn" type="button" onClick={handleCopyKey}>{copied ? 'Đã sao chép' : 'Copy'}</button>
              </div>
            </div>

            {copyError && <div className="notice warning" style={{ marginTop: 10 }}>Trình duyệt chặn clipboard. Hãy chọn và sao chép key thủ công.</div>}

            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              APIVN chỉ lưu hash của API key trên server. Full key được giữ tạm trong phiên tab sau khi bạn đăng nhập bằng key hoặc vừa reset; không lưu vào localStorage.
            </p>

            <div className="quick-config" style={{ marginTop: 18 }}>
              <div className="config-item"><small>Base URL</small><code>{PUBLIC_BASE_URL}</code></div>
              <div className="config-item"><small>Auth header</small><code>Authorization: Bearer sk-apivn-...</code></div>
              <div className="config-item"><small>Last used</small><code>{activeKey.last_used_at ? formatVietnamDateTime(activeKey.last_used_at) : 'Chưa dùng'}</code></div>
              <div className="config-item"><small>Created</small><code>{formatVietnamDate(activeKey.created_at)}</code></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn secondary" type="button" disabled={creating} onClick={handleCreateOrReset}>
                {creating ? 'Đang reset…' : 'Reset API Key'}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-card">
            <div className="empty-icon">K</div>
            <strong>Chưa có API key</strong>
            <p>Nạp tiền thành công rồi tạo key đầu tiên. Từ đó bạn dùng đúng một key cho toàn bộ APIVN.</p>
            <button className="btn" type="button" disabled={creating} onClick={handleCreateOrReset}>
              {creating ? 'Đang tạo…' : 'Tạo API Key'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
