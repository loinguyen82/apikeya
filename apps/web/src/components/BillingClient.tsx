'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatVietnamDateTime } from '@/lib/date'
import { formatCreditFromMicros, formatCreditFromVnd, formatVnd } from '@/lib/money'

interface TopupData {
  id: string
  payable_vnd: number
  amount_micros: string
  bonus_micros: string
  status: string
  created_at: string
}

type MockOrder = {
  id: string
  reference: string
  amount: number
  createdAt: string
  expiresAt: string
  status: 'pending_mock' | 'demo_completed' | 'expired' | 'cancelled'
}

const presets = [1000, 5000, 10000, 20000, 50000, 100000, 200000, 500000]

export function BillingClient({
  wallet,
  recentTopups,
  welcome,
}: {
  wallet: { available_micros: string; reserved_micros: string } | null
  recentTopups: TopupData[]
  welcome: boolean
}) {
  const [selectedAmount, setSelectedAmount] = useState(1000)
  const [order, setOrder] = useState<MockOrder | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [acceptedDemoTerms, setAcceptedDemoTerms] = useState(false)
  const amountValid = Number.isSafeInteger(selectedAmount) && selectedAmount >= 1000 && selectedAmount % 1000 === 0

  useEffect(() => {
    if (!order || order.status !== 'pending_mock') return

    const expiresAt = new Date(order.expiresAt).getTime()
    const updateClock = () => {
      const nextNow = Date.now()
      setNow(nextNow)
      if (nextNow >= expiresAt) {
        setOrder((current) => current?.id === order.id && current.status === 'pending_mock'
          ? { ...current, status: 'expired' }
          : current)
      }
    }

    updateClock()
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [order?.id, order?.expiresAt, order?.status])

  const remainingSeconds = order?.status === 'pending_mock'
    ? Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 1000))
    : 0

  function createMockOrder() {
    if (!amountValid || !acceptedDemoTerms) return
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000)
    const entropy = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()
    setOrder({
      id: `mock_${entropy.toLowerCase()}`,
      reference: `DEMO-${entropy}`,
      amount: selectedAmount,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'pending_mock',
    })
    setNow(now.getTime())
  }

  const orderPresentation = order
    ? {
        pending_mock: { title: 'Chờ thanh toán mô phỏng', tone: 'warning' },
        demo_completed: { title: 'Demo đã hoàn tất', tone: 'success' },
        expired: { title: 'Order demo đã hết hạn', tone: 'danger' },
        cancelled: { title: 'Order demo đã huỷ', tone: 'danger' },
      }[order.status]
    : null

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Billing</div>
          <h1>Nạp số dư</h1>
          <p>Checkout theo từng bước rõ ràng, hiện chỉ mô phỏng giao diện trong lúc chờ kết nối PayOS.</p>
        </div>
        <span className="mock-badge">Chưa kết nối PayOS</span>
      </header>

      {welcome && <div className="notice success"><strong>Tài khoản đã sẵn sàng.</strong> Bạn có thể đi thử toàn bộ checkout bên dưới; demo sẽ không cộng số dư thật.</div>}
      <div className="notice warning"><strong>Chế độ mô phỏng:</strong> không có tài khoản ngân hàng thật, không phát webhook và không ghi giao dịch vào wallet/ledger.</div>

      <div className="billing-grid">
        <section className="surface wallet-card">
          <div className="eyebrow">Wallet</div>
          <span className="muted">Số dư khả dụng</span>
          <div className="balance">{formatCreditFromMicros(wallet?.available_micros ?? '0')}</div>
          <div className="subtle-panel"><span className="muted" style={{ fontSize: 11 }}>Đang tạm giữ</span><strong style={{ display: 'block', marginTop: 4 }}>{formatCreditFromMicros(wallet?.reserved_micros ?? '0')}</strong></div>
          <span className="status-chip success" style={{ marginTop: 14 }}><span className="status-dot" /> Credit thật không hết hạn</span>
        </section>

        <section className="surface surface-pad">
          <div className="eyebrow">Mock checkout</div>
          <h2 style={{ margin: '4px 0 16px', fontSize: 20 }}>1. Chọn cách sử dụng</h2>
          <div className="billing-plan-grid" role="group" aria-label="Cách sử dụng credit">
            <button type="button" className="billing-plan-choice active" aria-pressed="true">
              <span><strong>Pay as you go</strong><small>Trừ Credit theo từng request</small></span>
              <span className="status-chip success">Đã chọn</span>
            </button>
            <button type="button" className="billing-plan-choice" disabled aria-pressed="false">
              <span><strong>Gói định kỳ</strong><small>Sẽ mở sau khi có bảng giá chính thức</small></span>
              <span className="status-chip">Sắp mở</span>
            </button>
          </div>
          <h2 style={{ margin: '22px 0 16px', fontSize: 20 }}>2. Chọn số tiền</h2>
          <div className="amount-grid">
            {presets.map((amount) => (
              <button key={amount} type="button" className={`amount-choice ${selectedAmount === amount ? 'active' : ''}`} aria-pressed={selectedAmount === amount} onClick={() => { setSelectedAmount(amount); setOrder(null) }}>
                <strong>{formatVnd(amount)}</strong><small>{formatCreditFromVnd(amount)}</small>{amount === 100000 && <small className="bonus">Phổ biến</small>}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="mock-amount">Hoặc nhập số tiền · bước 1.000đ</label>
            <input id="mock-amount" className="input" type="number" min={1000} step={1000} inputMode="numeric" value={selectedAmount || ''} onChange={(event) => { setSelectedAmount(Number(event.target.value)); setOrder(null) }} />
            {!amountValid && <span className="field-hint" style={{ color: 'var(--tide-warning)' }}>Tối thiểu 1.000đ và chia hết cho 1.000đ.</span>}
          </div>
          <label className="billing-consent">
            <input type="checkbox" checked={acceptedDemoTerms} onChange={(event) => setAcceptedDemoTerms(event.target.checked)} aria-label="Xác nhận điều kiện demo" />
            <span><strong>3. Xác nhận demo</strong> Tôi hiểu QR này chỉ mô phỏng flow, không chuyển tiền và không cộng Credit thật.</span>
          </label>
          <button type="button" className="btn" style={{ width: '100%', marginTop: 16 }} disabled={!amountValid || !acceptedDemoTerms} onClick={createMockOrder}>Tạo thanh toán mô phỏng · {formatVnd(selectedAmount || 0)}</button>
        </section>
      </div>

      {order && (
        <section className="surface">
          <div className="surface-head">
            <div><div className="eyebrow">Order {order.id}</div><h2 style={{ fontSize: 18 }}>{orderPresentation?.title}</h2></div>
            <span className={`status-chip ${orderPresentation?.tone}`}>{order.status}</span>
          </div>
          <div className="mock-checkout">
            <div className="mock-qr" role="img" aria-label="Mã QR mô phỏng, không chứa thông tin ngân hàng thật" />
            <div className="mock-details">
              <div className="mock-line"><span>Mã tham chiếu</span><code>{order.reference}</code></div>
              <div className="mock-line"><span>Số tiền demo</span><strong>{formatVnd(order.amount)}</strong></div>
              <div className="mock-line"><span>Credit minh họa</span><strong>{formatCreditFromVnd(order.amount)}</strong></div>
              <div className="mock-line"><span>Hết hạn lúc</span><strong>{new Date(order.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</strong></div>
              {order.status === 'pending_mock' && <div className="mock-line"><span>Còn lại</span><strong>{Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:{(remainingSeconds % 60).toString().padStart(2, '0')}</strong></div>}
              {order.status === 'pending_mock' ? (
                <>
                  <div className="notice warning">Đây không phải QR thanh toán. Nút bên dưới chỉ đổi state của giao diện, không gọi API tài chính.</div>
                  <button type="button" className="btn" onClick={() => setOrder({ ...order, status: 'demo_completed' })}>Mô phỏng đã thanh toán</button>
                  <button type="button" className="btn secondary" onClick={() => setOrder({ ...order, status: 'cancelled' })}>Huỷ demo</button>
                </>
              ) : order.status === 'demo_completed' ? (
                <>
                  <div className="notice success"><strong>Flow demo hoàn tất.</strong> Số dư thật không thay đổi và chưa thể phát key thật. Bạn vẫn có thể xem trước bước cấu hình; khi PayOS được kết nối, webhook đã xác minh mới cộng tiền.</div>
                  <Link className="btn" href="/dashboard/config">Xem bước cấu hình demo →</Link>
                  <button type="button" className="btn secondary" onClick={() => setOrder(null)}>Thử một order khác</button>
                </>
              ) : (
                <>
                  <div className="notice warning"><strong>{order.status === 'expired' ? 'Order đã hết hạn.' : 'Order đã được huỷ.'}</strong> Không có giao dịch tài chính nào được tạo và số dư thật vẫn giữ nguyên.</div>
                  <button type="button" className="btn secondary" onClick={() => setOrder(null)}>Tạo order demo mới</button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="surface model-table-shell">
        <div className="surface-head"><h2 style={{ fontSize: 17 }}>Yêu cầu nạp trước đây</h2><span className="status-chip">{recentTopups.length} yêu cầu</span></div>
        {recentTopups.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Thời gian</th><th>Mã</th><th>Số tiền</th><th>Credit</th><th>Trạng thái</th></tr></thead>
              <tbody>{recentTopups.map((topup) => (
                <tr key={topup.id}>
                  <td>{formatVietnamDateTime(topup.created_at)}</td><td><code>{topup.id.slice(0, 8).toUpperCase()}</code></td><td>{formatVnd(topup.payable_vnd)}</td><td><strong>{formatCreditFromMicros(BigInt(topup.amount_micros) + BigInt(topup.bonus_micros))}</strong></td><td><span className={`status-chip ${topup.status === 'paid' ? 'success' : topup.status === 'pending' ? 'warning' : 'danger'}`}>{topup.status === 'paid' ? 'Thành công' : topup.status === 'pending' ? 'Chờ xử lý' : topup.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty-state"><strong>Chưa có giao dịch thật</strong><p>Các order mô phỏng ở trên không được ghi vào lịch sử này.</p></div>}
      </section>
    </div>
  )
}
