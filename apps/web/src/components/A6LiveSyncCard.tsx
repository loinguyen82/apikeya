'use client'

import React, { useState } from 'react'

export function A6LiveSyncCard({ initialUsd = 4 }: { initialUsd?: number }) {
  const [usd, setUsd] = useState<number>(initialUsd)
  const [rate, setRate] = useState<number>(25400)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const calculatedVnd = Math.round(usd * rate)

  async function handleSync() {
    setLoading(true)
    setStatusMsg(null)

    try {
      const res = await fetch('/api/admin/a6-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usd, rate }),
      })

      const json = await res.json()

      if (json.ok && json.synced === false) {
        setStatusMsg(`Đã đọc số dư A6API: ${new Intl.NumberFormat('vi-VN').format(json.vnd)}đ. Ví ứng dụng không bị ghi đè.`)
      } else if (json.ok) {
        setStatusMsg(`🎉 Đã đồng bộ thành công! Số dư ví của bạn đã được cập nhật thành ${new Intl.NumberFormat('vi-VN').format(json.vnd)}đ`)
        setTimeout(() => {
          window.location.reload()
        }, 1200)
      } else {
        setStatusMsg('Lỗi: ' + (json.error || 'Không thể đồng bộ'))
      }
    } catch {
      setStatusMsg('Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 'var(--radius-md)',
        padding: '20px 24px',
      }}
      className="stack"
    >
      <div className="row" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="row" style={{ gap: '8px' }}>
            <span className="badge" style={{ background: 'var(--primary)', color: '#fff' }}>
              👑 Dành riêng cho Admin
            </span>
            <h3 style={{ fontSize: '16px' }}>Quy Đổi & Đồng Bộ Số Dư Trực Tiếp từ A6API ($ ⇋ VNĐ)</h3>
          </div>
          <p className="muted" style={{ fontSize: '13px', marginTop: '4px' }}>
            Quy đổi số đô / điểm bạn đang có bên tài khoản A6API thành số dư VNĐ trong ví của bạn trên web.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '4px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Số đô A6API bạn có ($)
          </label>
          <input
            className="input"
            type="number"
            step="0.5"
            min="0"
            value={usd}
            onChange={(e) => setUsd(Math.max(0, Number(e.target.value)))}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Tỷ giá quy đổi (VNĐ/$)
          </label>
          <input
            className="input"
            type="number"
            step="100"
            value={rate}
            onChange={(e) => setRate(Math.max(1, Number(e.target.value)))}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            Quy đổi ra VNĐ vào ví:
          </label>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary)', height: '42px', display: 'flex', alignItems: 'center' }}>
            {new Intl.NumberFormat('vi-VN').format(calculatedVnd)}đ
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn" onClick={handleSync} disabled={loading} style={{ width: '100%', height: '42px' }}>
            {loading ? 'Đang cập nhật ví...' : '🔄 Đồng bộ ngay vào Ví'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: statusMsg.startsWith('🎉') ? 'var(--success)' : 'var(--danger)',
            marginTop: '6px',
          }}
        >
          {statusMsg}
        </div>
      )}
    </div>
  )
}
