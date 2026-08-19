'use client'

import React, { useState } from 'react'
import { formatVnd, formatVndFromMicros } from '@/lib/money'

interface TopupItem {
  id: string
  user_id: string
  payable_vnd: number
  amount_micros: string
  bonus_micros: string
  payment_provider: string
  status: string
  created_at: string
  userEmail?: string
}

export function AdminTopupsClient({
  pendingTopups,
  historyTopups,
}: {
  pendingTopups: TopupItem[]
  historyTopups: TopupItem[]
}) {
  const [activeTab, setActiveTab] = useState<'pending' | 'manual' | 'history'>('pending')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form nạp tiền thủ công
  const [manualEmail, setManualEmail] = useState('')
  const [manualAmount, setManualAmount] = useState('100000')
  const [manualNote, setManualNote] = useState('Nạp tiền trực tiếp')
  const [manualLoading, setManualLoading] = useState(false)

  async function handleApprove(topupId: string) {
    if (!confirm('Bạn có chắc chắn đã nhận được tiền chuyển khoản và muốn cộng credit cho khách này?')) {
      return
    }

    setLoadingId(topupId)
    setActionMsg(null)

    try {
      const res = await fetch('/api/admin/topups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', topupId }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setActionMsg({ type: 'error', text: json.error || 'Không thể duyệt đơn' })
      } else {
        setActionMsg({ type: 'success', text: `✓ Đã duyệt đơn thành công! Tiền đã được cộng vào ví khách hàng.` })
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch {
      setActionMsg({ type: 'error', text: 'Lỗi kết nối máy chủ' })
    } finally {
      setLoadingId(null)
    }
  }

  async function handleReject(topupId: string) {
    if (!confirm('Bạn muốn từ chối / hủy đơn nạp này?')) {
      return
    }

    setLoadingId(topupId)
    setActionMsg(null)

    try {
      const res = await fetch('/api/admin/topups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reject', topupId }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setActionMsg({ type: 'error', text: json.error || 'Không thể hủy đơn' })
      } else {
        setActionMsg({ type: 'success', text: '✓ Đã hủy đơn nạp.' })
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch {
      setActionMsg({ type: 'error', text: 'Lỗi kết nối máy chủ' })
    } finally {
      setLoadingId(null)
    }
  }

  async function handleManualCredit(e: React.FormEvent) {
    e.preventDefault()
    setManualLoading(true)
    setActionMsg(null)

    try {
      const res = await fetch('/api/admin/topups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_credit',
          email: manualEmail.trim(),
          amountVnd: Number(manualAmount),
          note: manualNote.trim(),
        }),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setActionMsg({ type: 'error', text: json.error || 'Không thể cộng tiền' })
      } else {
        setActionMsg({ type: 'success', text: `🎉 ${json.message}` })
        setManualEmail('')
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch {
      setActionMsg({ type: 'error', text: 'Lỗi kết nối máy chủ' })
    } finally {
      setManualLoading(false)
    }
  }

  return (
    <div className="stack" style={{ gap: '24px' }}>
      <div>
        <h1>Quản Lý Nạp Tiền & Duyệt Credit 💳</h1>
        <p className="muted">
          Kiểm tra các giao dịch chuyển khoản STK / VietQR từ khách hàng, duyệt cộng tiền vào ví và nạp credit thủ công.
        </p>
      </div>

      {actionMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '14px',
            fontWeight: 600,
            background: actionMsg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: actionMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${actionMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Tabs chuyển đổi */}
      <div className="row" style={{ gap: '10px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
        <button
          type="button"
          className={activeTab === 'pending' ? 'btn' : 'btn secondary'}
          style={{ padding: '8px 16px', fontSize: '13px' }}
          onClick={() => setActiveTab('pending')}
        >
          ⏳ Đơn Chờ Duyệt ({pendingTopups.length})
        </button>
        <button
          type="button"
          className={activeTab === 'manual' ? 'btn' : 'btn secondary'}
          style={{ padding: '8px 16px', fontSize: '13px' }}
          onClick={() => setActiveTab('manual')}
        >
          ➕ Nạp / Thưởng Credit Thủ Công
        </button>
        <button
          type="button"
          className={activeTab === 'history' ? 'btn' : 'btn secondary'}
          style={{ padding: '8px 16px', fontSize: '13px' }}
          onClick={() => setActiveTab('history')}
        >
          📜 Lịch Sử Đã Xử Lý ({historyTopups.length})
        </button>
      </div>

      {/* TAB 1: ĐƠN CHỜ DUYỆT */}
      {activeTab === 'pending' && (
        <div className="card stack" style={{ gap: '16px' }}>
          <div className="row">
            <h3>Danh sách đơn chuyển khoản đang chờ duyệt</h3>
            <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', fontWeight: 600 }}>
              {pendingTopups.length} đơn cần đối soát
            </span>
          </div>

          {pendingTopups.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Cú pháp chuyển khoản</th>
                    <th>Email khách hàng</th>
                    <th>Số tiền chuyển</th>
                    <th>Số credit cộng</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTopups.map((t) => {
                    const memo = `NAP ${t.id.slice(0, 8).toUpperCase()}`
                    const isBusy = loadingId === t.id
                    return (
                      <tr key={t.id}>
                        <td>{new Date(t.created_at).toLocaleString('vi-VN')}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '13px',
                              fontWeight: 700,
                              background: 'rgba(99, 102, 241, 0.1)',
                              color: 'var(--primary-hover)',
                            }}
                          >
                            {memo}
                          </span>
                        </td>
                        <td>
                          <strong>{t.userEmail || t.user_id.slice(0, 8)}</strong>
                        </td>
                        <td style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>
                          {formatVnd(t.payable_vnd)}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                          +{formatVndFromMicros(BigInt(t.amount_micros) + BigInt(t.bonus_micros))}
                        </td>
                        <td>
                          <div className="row" style={{ gap: '8px' }}>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--success)', borderColor: 'var(--success)' }}
                              disabled={isBusy}
                              onClick={() => handleApprove(t.id)}
                            >
                              {isBusy ? 'Đang duyệt...' : '✓ Duyệt & Cộng tiền'}
                            </button>
                            <button
                              type="button"
                              className="btn secondary"
                              style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--danger)' }}
                              disabled={isBusy}
                              onClick={() => handleReject(t.id)}
                            >
                              ✕ Hủy
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ padding: '36px 0', textAlign: 'center' }}>
              ✓ Không có đơn nạp nào đang chờ duyệt. Mọi giao dịch đã được xử lý xong!
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NẠP CREDIT THỦ CÔNG */}
      {activeTab === 'manual' && (
        <div className="card stack" style={{ maxWidth: 560, gap: '20px' }}>
          <div>
            <h3>Cộng Credit Trực Tiếp Cho Khách Hàng</h3>
            <p className="muted" style={{ fontSize: '13px', marginTop: '4px' }}>
              Sử dụng khi khách chuyển khoản riêng qua Zalo/Facebook, tặng quà trải nghiệm hoặc hoàn tiền sự cố.
            </p>
          </div>

          <form onSubmit={handleManualCredit} className="stack" style={{ gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Email tài khoản nhận tiền
              </label>
              <input
                className="input"
                type="email"
                placeholder="khachhang@gmail.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Số tiền cần nạp (VNĐ)
              </label>
              <input
                className="input"
                type="number"
                min="10000"
                step="10000"
                placeholder="100000"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                required
              />
              <span className="muted" style={{ fontSize: '12px', marginTop: '4px', display: 'block' }}>
                = {formatVnd(Number(manualAmount) || 0)} credit vào ví
              </span>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Ghi chú / Lý do nạp
              </label>
              <input
                className="input"
                type="text"
                placeholder="Chuyển khoản qua Zalo / Tặng thử nghiệm"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
              />
            </div>

            <button className="btn" type="submit" disabled={manualLoading} style={{ marginTop: '8px' }}>
              {manualLoading ? 'Đang xử lý nạp tiền...' : '🚀 Xác nhận & Nạp Credit Ngay'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: LỊCH SỬ ĐÃ XỬ LÝ */}
      {activeTab === 'history' && (
        <div className="card stack">
          <h3>Lịch sử giao dịch nạp tiền gần nhất</h3>
          {historyTopups.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Mã đơn</th>
                    <th>Email khách</th>
                    <th>Số tiền</th>
                    <th>Credit nhận</th>
                    <th>Kênh</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {historyTopups.map((t) => (
                    <tr key={t.id}>
                      <td>{new Date(t.created_at).toLocaleString('vi-VN')}</td>
                      <td>
                        <code>{t.id.slice(0, 8).toUpperCase()}</code>
                      </td>
                      <td>{t.userEmail || t.user_id.slice(0, 8)}</td>
                      <td>{formatVnd(t.payable_vnd)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                        +{formatVndFromMicros(BigInt(t.amount_micros) + BigInt(t.bonus_micros))}
                      </td>
                      <td>
                        <span className="badge">{t.payment_provider}</span>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: t.status === 'paid' ? 'var(--success-bg)' : 'var(--danger-bg)',
                            color: t.status === 'paid' ? 'var(--success)' : 'var(--danger)',
                            fontWeight: 600,
                          }}
                        >
                          {t.status === 'paid' ? '✓ Thành công' : 'Đã hủy'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              Chưa có lịch sử giao dịch nào.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
