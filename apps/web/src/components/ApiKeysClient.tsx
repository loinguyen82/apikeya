'use client'

import React, { useState } from 'react'
import { formatVietnamDate, formatVietnamDateTime } from '@/lib/date'

interface KeyItem { id: string; name: string; prefix: string; status: string; last_used_at: string | null; created_at: string }

export function ApiKeysClient({ initialKeys }: { initialKeys: KeyItem[] }) {
  const [keys, setKeys] = useState<KeyItem[]>(initialKeys)
  const [keyName, setKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech'
  const activeKey = keys.find((key) => key.status === 'active')

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault(); setCreating(true); setErrorMsg(null)
    try {
      const res = await fetch('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: keyName.trim() || 'API Key' }) })
      const json = await res.json()
      if (!res.ok || json.error) setErrorMsg(json.error || 'Không thể tạo API key')
      else {
        setNewKeyPlaintext(json.plaintext)
        setKeys([
          { id: json.key.id, name: json.key.name, prefix: json.key.prefix, status: 'active', last_used_at: null, created_at: json.key.created_at || new Date().toISOString() },
          ...keys.map((key) => key.status === 'active' ? { ...key, status: 'revoked' } : key),
        ])
        setKeyName('')
      }
    } catch { setErrorMsg('Lỗi kết nối máy chủ') } finally { setCreating(false) }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Thu hồi API key này? Ứng dụng đang dùng key sẽ ngừng truy cập và bạn cần tạo key mới trước lần đăng nhập tiếp theo.')) return
    setRevokingId(keyId)
    try {
      const res = await fetch('/api/keys', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: keyId }) })
      if (res.ok) setKeys(keys.map((k) => k.id === keyId ? { ...k, status: 'revoked' } : k))
      else setErrorMsg('Không thể thu hồi API key')
    } catch { setErrorMsg('Không thể thu hồi API key') } finally { setRevokingId(null) }
  }

  async function copyKey(text: string) {
    setCopyError(false)
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2200) } catch { setCopyError(true) }
  }

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy"><div className="eyebrow">API key</div><h1>Credential của tài khoản</h1><p>Mỗi tài khoản chỉ có một API key active. Key này dùng cả để gọi API và đăng nhập Developer Console.</p></div>
      </header>

      {errorMsg && <div className="notice danger" role="alert">{errorMsg}</div>}
      {newKeyPlaintext && (
        <section className="surface surface-pad">
          <div className="page-head" style={{ marginBottom: 14 }}><div><span className="status-chip success">Key mới đã active</span><h3 style={{ marginTop: 8 }}>Lưu secret trước khi đóng</h3><p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Secret chỉ hiển thị một lần. Key cũ đã bị thu hồi.</p></div><button className="btn secondary" type="button" onClick={() => setNewKeyPlaintext(null)}>Đã lưu</button></div>
          <div className="secret-box"><code>{newKeyPlaintext}</code><button className="btn" type="button" onClick={() => copyKey(newKeyPlaintext)}>{copied ? 'Đã sao chép' : 'Sao chép'}</button></div>
          {copyError && <div className="notice warning" style={{ marginTop: 10 }}>Trình duyệt chặn clipboard. Hãy sao chép secret thủ công.</div>}
        </section>
      )}

      <div className="key-grid">
        <section className="surface surface-pad">
          <div className="eyebrow">Credential</div><h3 style={{ margin: '6px 0 8px' }}>{activeKey ? 'Rotate API key' : 'Tạo API key'}</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{activeKey ? `Key active hiện tại: ${activeKey.prefix}••••••. Tạo key mới sẽ thu hồi key này ngay.` : 'Tạo credential đầu tiên để đăng nhập và gọi API.'}</p>
          <form onSubmit={handleCreateKey} className="page-stack" style={{ gap: 14 }}>
            <div className="field"><label htmlFor="key-name">Tên key</label><input id="key-name" className="input" type="text" placeholder="Production" value={keyName} onChange={(e) => setKeyName(e.target.value)} /><span className="field-hint">Quota và số dư vẫn thuộc cùng wallet khi rotate key.</span></div>
            <button className="btn" type="submit" disabled={creating}>{creating ? 'Đang xử lý…' : activeKey ? 'Rotate API key' : 'Tạo API key'}</button>
          </form>
          <div className="quick-config" style={{ marginTop: 20 }}><div className="config-item"><small>Base URL</small><code>{gatewayUrl}/v1</code></div><div className="config-item"><small>Auth header</small><code>Bearer sk-...</code></div></div>
        </section>

        <section className="surface model-table-shell">
          <div className="surface-head"><h3>Lịch sử key</h3><span className="status-chip">{activeKey ? '1 active' : '0 active'}</span></div>
          {keys.length > 0 ? (
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Tên</th><th>Prefix</th><th>Trạng thái</th><th>Dùng gần nhất</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
              {keys.map((k) => <tr key={k.id}><td><strong>{k.name}</strong></td><td><code>{k.prefix}••••••</code></td><td><span className={`status-chip ${k.status === 'active' ? 'success' : ''}`}>{k.status === 'active' ? 'Active' : 'Revoked'}</span></td><td>{k.last_used_at ? formatVietnamDateTime(k.last_used_at) : 'Chưa dùng'}</td><td>{formatVietnamDate(k.created_at)}</td><td>{k.status === 'active' && <button type="button" className="btn secondary" disabled={revokingId === k.id} onClick={() => handleRevoke(k.id)}>{revokingId === k.id ? 'Đang xử lý' : 'Thu hồi'}</button>}</td></tr>)}
            </tbody></table></div>
          ) : <div className="surface-body"><div className="empty-card"><div className="empty-icon">K</div><strong>Chưa có API key</strong><p>Tạo key đầu tiên ở cột bên trái để kết nối SDK và đăng nhập lần sau.</p></div></div>}
        </section>
      </div>
    </div>
  )
}
