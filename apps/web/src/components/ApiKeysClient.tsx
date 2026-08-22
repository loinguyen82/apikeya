'use client'

import React, { useEffect, useRef, useState } from 'react'
import { formatVietnamDate, formatVietnamDateTime } from '@/lib/date'
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
  return `${key.prefix}-••••••••••••${key.last_four || 'legacy'}`
}

export function ApiKeysClient({ initialKeys }: { initialKeys: KeyItem[] }) {
  const [keys, setKeys] = useState(initialKeys)
  const [keyName, setKeyName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const secretPanelRef = useRef<HTMLElement>(null)
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech'
  const activeCount = keys.filter((key) => key.status === 'active').length

  useEffect(() => {
    if (!newKeyPlaintext) return
    const frame = requestAnimationFrame(() => secretPanelRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [newKeyPlaintext])

  async function request(body: unknown, method: 'POST' | 'PATCH' | 'DELETE') {
    const response = await fetch('/api/keys', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.error) throw new Error(result?.error || 'Không thể cập nhật API Key')
    return result
  }

  function revealSecret(result: any) {
    if (typeof result?.plaintext !== 'string' || !result?.key?.id) throw new Error('Máy chủ không trả về secret mới')
    setNewKeyPlaintext(result.plaintext)
    setCopied(false)
  }

  async function handleCreateKey(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    setErrorMsg(null)
    try {
      const result = await request({ name: keyName.trim() || 'Default' }, 'POST')
      revealSecret(result)
      setKeys((current) => [{ ...result.key, request_count: 0 }, ...current])
      setKeyName('')
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể tạo API Key')
    } finally {
      setCreating(false)
    }
  }

  async function handleRename(key: KeyItem) {
    const name = window.prompt('Tên mới cho API Key', key.name)?.trim()
    if (!name || name === key.name) return
    setBusyId(key.id)
    setErrorMsg(null)
    try {
      const result = await request({ id: key.id, action: 'rename', name }, 'PATCH')
      setKeys((current) => current.map((item) => item.id === key.id ? { ...item, name: result.key.name } : item))
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể đổi tên API Key')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRotate(key: KeyItem) {
    if (!window.confirm(`Rotate “${key.name}”? Key cũ sẽ bị thu hồi ngay.`)) return
    setBusyId(key.id)
    setErrorMsg(null)
    try {
      const result = await request({ id: key.id, action: 'rotate', name: key.name }, 'PATCH')
      revealSecret(result)
      setKeys((current) => [{ ...result.key, request_count: 0 }, ...current.map((item) => item.id === key.id ? { ...item, status: 'revoked' } : item)])
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể rotate API Key')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRevoke(key: KeyItem) {
    if (!window.confirm(`Thu hồi “${key.name}”? Ứng dụng đang dùng key này sẽ bị từ chối.`)) return
    setBusyId(key.id)
    setErrorMsg(null)
    try {
      await request({ id: key.id }, 'DELETE')
      setKeys((current) => current.map((item) => item.id === key.id ? { ...item, status: 'revoked' } : item))
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể thu hồi API Key')
    } finally {
      setBusyId(null)
    }
  }

  async function copySecret() {
    if (!newKeyPlaintext) return
    try {
      await navigator.clipboard.writeText(newKeyPlaintext)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setErrorMsg('Trình duyệt chặn clipboard. Hãy sao chép secret thủ công.')
    }
  }

  return (
    <div className="page-stack">
      <header className="page-head"><div className="page-head-copy"><div className="eyebrow">API Keys</div><h1>Credential gọi APIVN API</h1><p>Tạo nhiều key cho Production, Development hoặc từng công cụ. Tất cả dùng chung wallet của account.</p></div><span className="status-chip success">{activeCount} active</span></header>
      {errorMsg && <div className="notice danger" role="alert">{errorMsg}</div>}
      {newKeyPlaintext && <section ref={secretPanelRef} className="surface surface-pad key-secret-panel" role="dialog" aria-labelledby="new-key-title" aria-live="assertive" tabIndex={-1}><div className="page-head" style={{ marginBottom: 14 }}><div><span className="status-chip success">Secret chỉ hiển thị một lần</span><h2 id="new-key-title" style={{ marginTop: 8, fontSize: 20 }}>Lưu API Key ngay bây giờ</h2><p className="muted" style={{ fontSize: 12, marginTop: 4 }}>APIVN chỉ lưu SHA-256 hash và không thể khôi phục secret này.</p></div><button className="btn secondary" type="button" onClick={() => setNewKeyPlaintext(null)}>Tôi đã lưu</button></div><div className="secret-box"><div className="secret-value"><small>Secret key</small><code data-testid="new-api-key">{newKeyPlaintext}</code></div><button className="btn" type="button" onClick={copySecret}>{copied ? 'Đã copy' : 'Copy API Key'}</button></div></section>}
      <section className="surface surface-pad key-create-row"><div><div className="eyebrow">Create</div><h2 style={{ margin: '5px 0', fontSize: 18 }}>Tạo API Key mới</h2><p className="muted" style={{ fontSize: 12 }}>Không cần nạp tiền để tạo key. Balance chỉ được kiểm tra khi gửi request.</p></div><form onSubmit={handleCreateKey} className="key-create-form"><div className="field"><label htmlFor="key-name">Tên key</label><input id="key-name" className="input" type="text" maxLength={80} placeholder="Production" value={keyName} onChange={(event) => setKeyName(event.target.value)} /></div><button className="btn" type="submit" disabled={creating}>{creating ? 'Đang tạo…' : 'Create API Key'}</button></form></section>
      <section className="surface model-table-shell"><div className="surface-head"><div><h2>API Keys</h2><span className="muted" style={{ fontSize: 11 }}>Base URL: <code>{gatewayUrl}/v1</code></span></div><span className="status-chip">{keys.length} keys</span></div>{keys.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last Used</th><th>Requests</th><th>Status</th><th>Actions</th></tr></thead><tbody>{keys.map((key) => <tr key={key.id}><td><strong>{key.name}</strong></td><td><code>{maskedKey(key)}</code></td><td>{formatVietnamDate(key.created_at)}</td><td>{key.last_used_at ? formatVietnamDateTime(key.last_used_at) : 'Chưa dùng'}</td><td>{formatNumber(key.request_count)}</td><td><span className={`status-chip ${key.status === 'active' ? 'success' : ''}`}>{key.status === 'active' ? 'Active' : 'Revoked'}</span></td><td><div className="table-actions"><button className="text-button" type="button" disabled={busyId === key.id} onClick={() => handleRename(key)}>Rename</button>{key.status === 'active' && <><button className="text-button" type="button" disabled={busyId === key.id} onClick={() => handleRotate(key)}>Rotate</button><button className="text-button danger-text" type="button" disabled={busyId === key.id} onClick={() => handleRevoke(key)}>Revoke</button></>}</div></td></tr>)}</tbody></table></div> : <div className="surface-body"><div className="empty-card"><div className="empty-icon">K</div><strong>Bạn chưa có API Key</strong><p>Tạo key đầu tiên để bắt đầu gọi APIVN API.</p><button type="button" className="btn" onClick={() => document.getElementById('key-name')?.focus()}>Create API Key</button></div></div>}</section>
    </div>
  )
}
