'use client'

import React, { useState } from 'react'

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
  const [keyName, setKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://ai-api-gateway.loi822004.workers.dev'

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim() || 'API Key' }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setErrorMsg(json.error || 'Không thể tạo API key')
      } else {
        setNewKeyPlaintext(json.plaintext)
        setKeys([
          {
            id: json.key.id,
            name: json.key.name,
            prefix: json.key.prefix,
            status: 'active',
            last_used_at: null,
            created_at: json.key.created_at || new Date().toISOString(),
          },
          ...keys,
        ])
        setKeyName('')
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Bạn có chắc chắn muốn thu hồi khóa API này? Ứng dụng đang dùng khóa này sẽ bị từ chối truy cập.')) {
      return
    }

    setRevokingId(keyId)
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: keyId }),
      })

      if (res.ok) {
        setKeys(keys.map((k) => (k.id === keyId ? { ...k, status: 'revoked' } : k)))
      }
    } catch {
      alert('Không thể thu hồi khóa')
    } finally {
      setRevokingId(null)
    }
  }

  function copyKey(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div className="row">
        <div>
          <h1>Quản Lý Khóa API (API Keys) 🔑</h1>
          <p className="muted">
            Tạo và quản lý các khóa bí mật để kết nối ứng dụng của bạn (Cursor, VS Code, Python SDK, Web App) với AI Gateway.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '14px',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* KHUNG HIỂN THỊ KEY VỪA TẠO */}
      {newKeyPlaintext && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)',
            border: '2px solid var(--success)',
            borderRadius: 'var(--radius-md)',
            padding: '20px 24px',
          }}
          className="stack"
        >
          <div className="row">
            <div>
              <h3 style={{ color: 'var(--success)', fontSize: '18px' }}>🎉 Tạo Khóa API Mới Thành Công!</h3>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                Vui lòng <strong>sao chép và lưu trữ ngay</strong>. Khóa bí mật này sẽ <strong>không bao giờ hiển thị lại</strong> sau khi bạn đóng thông báo này.
              </p>
            </div>
            <button
              className="btn secondary"
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={() => setNewKeyPlaintext(null)}
            >
              ✓ Đã lưu, đóng lại
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'var(--bg)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
            }}
          >
            <code
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--primary-hover)',
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
                flex: 1,
              }}
            >
              {newKeyPlaintext}
            </code>
            <button
              className="btn"
              type="button"
              style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
              onClick={() => copyKey(newKeyPlaintext)}
            >
              {copied ? '✓ Đã sao chép!' : '📋 Sao chép Key'}
            </button>
          </div>
        </div>
      )}

      {/* FORM TẠO KEY MỚI */}
      <div className="card stack" style={{ gap: '14px' }}>
        <h3>Tạo API Key mới</h3>
        <form onSubmit={handleCreateKey} className="row" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="text"
            placeholder="Đặt tên khóa (ví dụ: Cursor IDE / Production App / Python Bot)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            style={{ flex: 1, minWidth: '260px' }}
          />
          <button className="btn" type="submit" disabled={creating} style={{ whiteSpace: 'nowrap' }}>
            {creating ? 'Đang tạo key...' : '+ Tạo API Key Mới'}
          </button>
        </form>
      </div>

      {/* BẢNG DANH SÁCH KEY */}
      <div className="card stack">
        <h3>Danh sách API Key ({keys.length})</h3>
        {keys.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tên định danh</th>
                  <th>Mã định danh (Prefix)</th>
                  <th>Trạng thái</th>
                  <th>Sử dụng gần nhất</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <strong>{k.name}</strong>
                    </td>
                    <td>
                      <code style={{ fontSize: '13px' }}>{k.prefix}••••••••••••</code>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: k.status === 'active' ? 'var(--success-bg)' : 'var(--danger-bg)',
                          color: k.status === 'active' ? 'var(--success)' : 'var(--danger)',
                          borderColor: k.status === 'active' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                          fontWeight: 600,
                        }}
                      >
                        {k.status === 'active' ? '✓ Đang hoạt động' : 'Đã thu hồi'}
                      </span>
                    </td>
                    <td className="muted">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString('vi-VN') : 'Chưa sử dụng'}
                    </td>
                    <td className="muted">{new Date(k.created_at).toLocaleDateString('vi-VN')}</td>
                    <td>
                      {k.status === 'active' && (
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }}
                          disabled={revokingId === k.id}
                          onClick={() => handleRevoke(k.id)}
                        >
                          {revokingId === k.id ? 'Đang xử lý...' : 'Thu hồi'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Bạn chưa tạo API key nào. Nhập tên và bấm <strong>"+ Tạo API Key Mới"</strong> ở trên để bắt đầu!
          </div>
        )}
      </div>

      {/* HƯỚNG DẪN TÍCH HỢP NHANH */}
      <div
        className="card stack"
        style={{
          background: 'var(--bg-subtle)',
          gap: '10px',
          border: '1px solid var(--line)',
        }}
      >
        <h4>🚀 Cách cấu hình nhanh vào các ứng dụng:</h4>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
          <div>
            • <strong>Base URL (OpenAI Compatible):</strong>{' '}
            <code style={{ color: 'var(--primary-hover)', fontWeight: 600 }}>{gatewayUrl}/v1</code>
          </div>
          <div>
            • <strong>API Key:</strong> Dán mã khóa dạng{' '}
            <code>ak_live_...</code> bạn vừa tạo ở trên.
          </div>
          <div>
            • Hỗ trợ mọi thư viện OpenAI SDK, LangChain, LlamaIndex, Cursor IDE, VS Code Continue, NextChat,...
          </div>
        </div>
      </div>
    </div>
  )
}
