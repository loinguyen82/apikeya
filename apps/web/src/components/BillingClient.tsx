'use client'

import React, { useState } from 'react'
import { formatVietnamDateTime } from '@/lib/date'
import { formatVnd, formatCreditFromMicros, formatCreditFromVnd } from '@/lib/money'
import { defaultBankConfig, generateVietQrUrl } from '@/lib/bank-config'

interface TopupData {
  id: string
  payable_vnd: number
  amount_micros: string
  bonus_micros: string
  payment_provider: string
  status: string
  created_at: string
  expires_at: string
}

function bonusForAmount(amount: number) {
  if (amount >= 1000000) return Math.floor(amount * 0.08)
  if (amount >= 500000) return Math.floor(amount * 0.05)
  if (amount >= 200000) return Math.floor(amount * 0.02)
  return 0
}

export function BillingClient({
  wallet,
  currentTopup,
  recentTopups,
}: {
  wallet: { available_micros: string; reserved_micros: string } | null
  currentTopup: TopupData | null
  recentTopups: TopupData[]
}) {
  const [selectedAmount, setSelectedAmount] = useState(1000)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [copyError, setCopyError] = useState(false)
  const [creating, setCreating] = useState(false)

  const packages = [
    { amount: 1000, credits: '1 Credit', bonus: 'Thử nhanh' },
    { amount: 5000, credits: '5 Credit', bonus: '' },
    { amount: 10000, credits: '10 Credit', bonus: '' },
    { amount: 20000, credits: '20 Credit', bonus: '' },
    { amount: 50000, credits: '50 Credit', bonus: '' },
    { amount: 100000, credits: '100 Credit', bonus: 'Phổ biến' },
    { amount: 200000, credits: '204 Credit', bonus: '+2%' },
    { amount: 500000, credits: '525 Credit', bonus: '+5%' },
    { amount: 1000000, credits: '1.080 Credit', bonus: '+8%' },
  ]

  const selectedBonus = bonusForAmount(selectedAmount)
  const selectedTotal = selectedAmount + selectedBonus
  const selectedAmountValid = Number.isSafeInteger(selectedAmount) && selectedAmount >= 1000 && selectedAmount % 1000 === 0

  async function copyToClipboard(text: string, field: string) {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1800)
    } catch {
      setCopyError(true)
    }
  }

  const isPayOS = currentTopup?.payment_provider === 'payos'
  const memo = currentTopup ? `NAP ${currentTopup.id.slice(0, 8).toUpperCase()}` : ''
  const topupExpired = currentTopup ? new Date(currentTopup.expires_at) <= new Date() : false
  const qrUrl = currentTopup && !isPayOS && !topupExpired
    ? generateVietQrUrl({ amount: currentTopup.payable_vnd, memo })
    : ''
  const currentStatus = currentTopup?.status === 'paid'
    ? ['success', 'Đã thanh toán']
    : currentTopup?.status === 'cancelled'
      ? ['danger', 'Đã huỷ']
      : topupExpired
        ? ['danger', 'Đã hết hạn']
        : ['warning', 'Chờ thanh toán']

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Billing</div>
          <h1>Nạp số dư bằng VietQR</h1>
          <p>Nạp từ 1.000đ. 1 Credit = 1.000đ, Credit không hết hạn. Giao dịch chỉ được cộng vào ví sau khi hệ thống nhận xác nhận thanh toán.</p>
        </div>
      </header>

      <div className="billing-grid">
        <section className="surface wallet-card">
          <div className="eyebrow">Wallet</div>
          <span className="muted">Số dư khả dụng</span>
          <div className="balance">{formatCreditFromMicros(wallet?.available_micros ?? '0')}</div>
          <div className="subtle-panel">
            <span className="muted" style={{ fontSize: 12 }}>Đang tạm giữ</span>
            <strong style={{ display: 'block', marginTop: 4 }}>{formatCreditFromMicros(wallet?.reserved_micros ?? '0')}</strong>
          </div>
          <span className="status-chip success"><span className="status-dot" /> Credit không hết hạn</span>
        </section>

        <section className="surface surface-pad">
          <div className="eyebrow">Top up</div>
          <h3 style={{ margin: '6px 0 14px' }}>Chọn số tiền</h3>
          <div className="amount-grid">
            {packages.map((pkg) => (
              <button
                key={pkg.amount}
                type="button"
                className={`amount-choice ${selectedAmount === pkg.amount ? 'active' : ''}`}
                onClick={() => setSelectedAmount(pkg.amount)}
              >
                <strong>{formatVnd(pkg.amount)}</strong>
                <small>{pkg.credits}</small>
                {pkg.bonus && <small className="bonus">{pkg.bonus}</small>}
              </button>
            ))}
          </div>

          <form action="/api/topups" method="post" onSubmit={() => setCreating(true)} style={{ marginTop: 14 }}>
            <label className="muted" htmlFor="custom-topup" style={{ display: 'block', marginBottom: 6 }}>
              Hoặc nhập số tiền · bước 1.000đ
            </label>
            <input
              id="custom-topup"
              className="input"
              type="number"
              name="amount"
              min={1000}
              step={1000}
              inputMode="numeric"
              value={selectedAmount || ''}
              onChange={(event) => setSelectedAmount(Number(event.target.value))}
            />
            <div className="subtle-panel" style={{ marginTop: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>Nhận được</span>
              <strong style={{ display: 'block', marginTop: 4 }}>{formatCreditFromVnd(selectedTotal)}</strong>
              {selectedBonus > 0 && <span className="muted" style={{ fontSize: 12 }}>Đã gồm bonus {formatVnd(selectedBonus)}</span>}
            </div>
            <button
              className="btn"
              type="submit"
              disabled={creating || !selectedAmountValid}
              style={{ width: '100%', marginTop: 12 }}
            >
              {creating
                ? 'Đang tạo thanh toán…'
                : selectedAmountValid
                  ? `Thanh toán · ${formatVnd(selectedAmount)}`
                  : 'Tối thiểu 1.000đ · bước 1.000đ'}
            </button>
          </form>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Không tự cộng tiền chỉ dựa vào việc mở QR. Ví chỉ tăng sau khi giao dịch được xác nhận.</p>
        </section>
      </div>

      {currentTopup && (
        <section className="surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">Payment #{currentTopup.id.slice(0, 8).toUpperCase()}</div>
              <h3 style={{ marginTop: 4 }}>Trạng thái thanh toán</h3>
            </div>
            <span className={`status-chip ${currentStatus[0]}`}>{currentStatus[1]}</span>
          </div>
          <div className="surface-body payment-grid">
            <div className="qr-shell">
              {currentTopup.status === 'paid' ? (
                <div className="empty-card" style={{ minHeight: 220 }}>
                  <div className="empty-icon">✓</div>
                  <strong>Thanh toán thành công</strong>
                  <p>Credit đã được cộng vào ví.</p>
                </div>
              ) : topupExpired ? (
                <div className="empty-card" style={{ minHeight: 220 }}>
                  <div className="empty-icon">!</div>
                  <strong>Thanh toán đã hết hạn</strong>
                  <p>Tạo yêu cầu mới để tiếp tục.</p>
                </div>
              ) : isPayOS ? (
                <div className="empty-card" style={{ minHeight: 220 }}>
                  <div className="empty-icon">₫</div>
                  <strong>Đang chờ payOS xác nhận</strong>
                  <p>Nếu bạn vừa thanh toán, trạng thái thường cập nhật sau khi webhook được nhận.</p>
                </div>
              ) : (
                <>
                  <img src={qrUrl} alt="Mã VietQR nạp tiền" />
                  <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Quét bằng ứng dụng ngân hàng</p>
                </>
              )}
            </div>

            <div className="payment-details">
              <div className="payment-line"><span><small>Số tiền</small><strong>{formatVnd(currentTopup.payable_vnd)}</strong></span></div>

              {!isPayOS && currentTopup.status !== 'paid' && !topupExpired && (
                <>
                  <div className="payment-line"><span><small>Ngân hàng</small><strong>{defaultBankConfig.bankName}</strong></span></div>
                  <div className="payment-line">
                    <span><small>Số tài khoản</small><strong>{defaultBankConfig.accountNo}</strong></span>
                    <button type="button" className="btn secondary" onClick={() => copyToClipboard(defaultBankConfig.accountNo, 'acc')}>{copiedField === 'acc' ? 'Đã copy' : 'Copy'}</button>
                  </div>
                  <div className="payment-line"><span><small>Chủ tài khoản</small><strong>{defaultBankConfig.accountName}</strong></span></div>
                  <div className="payment-line important">
                    <span><small>Nội dung bắt buộc</small><code>{memo}</code></span>
                    <button type="button" className="btn" onClick={() => copyToClipboard(memo, 'memo')}>{copiedField === 'memo' ? 'Đã copy' : 'Copy'}</button>
                  </div>
                </>
              )}

              {currentTopup.status === 'paid' ? (
                <div className="notice success">Đã cộng {formatCreditFromMicros(BigInt(currentTopup.amount_micros) + BigInt(currentTopup.bonus_micros))} vào ví.</div>
              ) : isPayOS && !topupExpired ? (
                <div className="notice warning">Không cộng Credit từ return URL. APIVN chỉ cộng tiền sau khi webhook payOS hợp lệ được xác minh.</div>
              ) : !topupExpired ? (
                <div className="notice warning">Chuyển đúng số tiền và nội dung <strong>{memo}</strong>. Sau khi đối soát, trạng thái sẽ chuyển sang Đã thanh toán.</div>
              ) : null}

              {copyError && <div className="notice warning">Không thể dùng clipboard. Hãy sao chép thủ công.</div>}
            </div>
          </div>
        </section>
      )}

      <section className="surface model-table-shell">
        <div className="surface-head"><h3>Lịch sử nạp tiền</h3><span className="status-chip">{recentTopups.length} giao dịch gần nhất</span></div>
        {recentTopups.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Thời gian</th><th>Mã</th><th>Số tiền</th><th>Credit</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {recentTopups.map((t) => (
                  <tr key={t.id}>
                    <td>{formatVietnamDateTime(t.created_at)}</td>
                    <td><code>{t.id.slice(0, 8).toUpperCase()}</code></td>
                    <td>{formatVnd(t.payable_vnd)}</td>
                    <td><strong>{formatCreditFromMicros(BigInt(t.amount_micros) + BigInt(t.bonus_micros))}</strong></td>
                    <td><span className={`status-chip ${t.status === 'paid' ? 'success' : t.status === 'pending' ? 'warning' : 'danger'}`}>{t.status === 'paid' ? 'Thành công' : t.status === 'pending' ? 'Chờ thanh toán' : t.status}</span></td>
                    <td>{t.status === 'pending' && <a href={`/dashboard/billing?topup=${t.id}`} className="btn secondary">{t.payment_provider === 'payos' ? 'Xem trạng thái' : 'Xem QR'}</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="surface-body"><div className="empty-card"><div className="empty-icon">₫</div><strong>Chưa có giao dịch</strong><p>Nạp từ 1.000đ để bắt đầu dùng Playground và API.</p></div></div>
        )}
      </section>
    </div>
  )
}
