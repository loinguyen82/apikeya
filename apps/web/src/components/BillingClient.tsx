'use client'

import React, { useState } from 'react'
import { formatVietnamDateTime } from '@/lib/date'
import { formatVnd, formatCreditFromMicros, formatCreditFromVnd } from '@/lib/money'
import { defaultBankConfig, generateVietQrUrl } from '@/lib/bank-config'

interface TopupData { id: string; payable_vnd: number; amount_micros: string; bonus_micros: string; status: string; created_at: string; expires_at: string }

export function BillingClient({ wallet, currentTopup, recentTopups }: { wallet: { available_micros: string; reserved_micros: string } | null; currentTopup: TopupData | null; recentTopups: TopupData[] }) {
  const [selectedAmount, setSelectedAmount] = useState(100000)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [copyError, setCopyError] = useState(false)
  const [creating, setCreating] = useState(false)

  const packages = [
    { amount: 50000, credits: '50 Credit', bonus: '' },
    { amount: 100000, credits: '100 Credit', bonus: 'Phổ biến' },
    { amount: 200000, credits: '200 Credit', bonus: '' },
    { amount: 500000, credits: '525 Credit', bonus: '+5%' },
    { amount: 1000000, credits: '1.100 Credit', bonus: '+10%' },
    { amount: 2000000, credits: '2.300 Credit', bonus: '+15%' },
  ]

  async function copyToClipboard(text: string, field: string) {
    setCopyError(false)
    try { await navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 1800) } catch { setCopyError(true) }
  }

  const memo = currentTopup ? `NAP ${currentTopup.id.slice(0, 8).toUpperCase()}` : ''
  const topupExpired = currentTopup ? new Date(currentTopup.expires_at) <= new Date() : false
  const qrUrl = currentTopup && !topupExpired ? generateVietQrUrl({ amount: currentTopup.payable_vnd, memo }) : ''
  const currentStatus = currentTopup?.status === 'paid' ? ['success', 'Đã thanh toán'] : topupExpired ? ['danger', 'Đã hết hạn'] : ['warning', 'Chờ chuyển khoản']

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy"><div className="eyebrow">Billing</div><h1>Nạp số dư bằng VietQR</h1><p>Chọn số tiền, tạo yêu cầu và quét QR bằng ứng dụng ngân hàng. 1 Credit = 1.000đ; bonus được cộng khi giao dịch được duyệt.</p></div>
      </header>

      <div className="billing-grid">
        <section className="surface wallet-card">
          <div className="eyebrow">Wallet</div><span className="muted">Số dư khả dụng</span><div className="balance">{formatCreditFromMicros(wallet?.available_micros ?? '0')}</div>
          <div className="subtle-panel"><span className="muted" style={{ fontSize: 12 }}>Đang tạm giữ</span><strong style={{ display: 'block', marginTop: 4 }}>{formatCreditFromMicros(wallet?.reserved_micros ?? '0')}</strong></div>
          <span className="status-chip success"><span className="status-dot" /> Credit không hết hạn</span>
        </section>

        <section className="surface surface-pad">
          <div className="eyebrow">Top up</div><h3 style={{ margin: '6px 0 14px' }}>Chọn số tiền</h3>
          <div className="amount-grid">
            {packages.map((pkg) => <button key={pkg.amount} type="button" className={`amount-choice ${selectedAmount === pkg.amount ? 'active' : ''}`} onClick={() => setSelectedAmount(pkg.amount)}><strong>{formatVnd(pkg.amount)}</strong><small>{pkg.credits}</small>{pkg.bonus && <small className="bonus">{pkg.bonus} bonus</small>}</button>)}
          </div>
          <form action="/api/topups" method="post" onSubmit={() => setCreating(true)} style={{ marginTop: 14 }}>
            <input type="hidden" name="amount" value={selectedAmount} />
            <button className="btn" type="submit" disabled={creating} style={{ width: '100%' }}>{creating ? 'Đang tạo yêu cầu…' : `Tiếp tục với ${formatVnd(selectedAmount)} · ${formatCreditFromVnd(selectedAmount)}`}</button>
          </form>
        </section>
      </div>

      {currentTopup && (
        <section className="surface">
          <div className="surface-head"><div><div className="eyebrow">Payment #{currentTopup.id.slice(0, 8).toUpperCase()}</div><h3 style={{ marginTop: 4 }}>Thông tin chuyển khoản</h3></div><span className={`status-chip ${currentStatus[0]}`}>{currentStatus[1]}</span></div>
          <div className="surface-body payment-grid">
            <div className="qr-shell">
              {topupExpired ? <div className="empty-card" style={{ minHeight: 220 }}><div className="empty-icon">!</div><strong>QR đã hết hạn</strong><p>Tạo yêu cầu mới để nhận mã thanh toán hợp lệ.</p></div> : <><img src={qrUrl} alt="Mã VietQR nạp tiền" /><p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Quét bằng ứng dụng ngân hàng</p></>}
            </div>
            <div className="payment-details">
              <div className="payment-line"><span><small>Ngân hàng</small><strong>{defaultBankConfig.bankName}</strong></span></div>
              <div className="payment-line"><span><small>Số tài khoản</small><strong>{defaultBankConfig.accountNo}</strong></span><button type="button" className="btn secondary" onClick={() => copyToClipboard(defaultBankConfig.accountNo, 'acc')}>{copiedField === 'acc' ? 'Đã copy' : 'Copy'}</button></div>
              <div className="payment-line"><span><small>Chủ tài khoản</small><strong>{defaultBankConfig.accountName}</strong></span></div>
              <div className="payment-line"><span><small>Số tiền</small><strong>{formatVnd(currentTopup.payable_vnd)}</strong></span><button type="button" className="btn secondary" onClick={() => copyToClipboard(String(currentTopup.payable_vnd), 'amount')}>{copiedField === 'amount' ? 'Đã copy' : 'Copy'}</button></div>
              <div className="payment-line important"><span><small>Nội dung bắt buộc</small><code>{memo}</code></span><button type="button" className="btn" onClick={() => copyToClipboard(memo, 'memo')}>{copiedField === 'memo' ? 'Đã copy' : 'Copy'}</button></div>
              {currentTopup.status === 'paid' ? <div className="notice success">Đã cộng {formatCreditFromMicros(BigInt(currentTopup.amount_micros) + BigInt(currentTopup.bonus_micros))} vào ví.</div> : !topupExpired ? <div className="notice warning">Chuyển đúng số tiền và nội dung <strong>{memo}</strong> để giao dịch được đối soát.</div> : null}
              {copyError && <div className="notice warning">Không thể dùng clipboard. Hãy sao chép thủ công.</div>}
            </div>
          </div>
        </section>
      )}

      <section className="surface model-table-shell">
        <div className="surface-head"><h3>Lịch sử nạp tiền</h3><span className="status-chip">{recentTopups.length} giao dịch gần nhất</span></div>
        {recentTopups.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Thời gian</th><th>Mã</th><th>Số tiền</th><th>Credit</th><th>Trạng thái</th><th></th></tr></thead><tbody>
          {recentTopups.map((t) => <tr key={t.id}><td>{formatVietnamDateTime(t.created_at)}</td><td><code>{t.id.slice(0, 8).toUpperCase()}</code></td><td>{formatVnd(t.payable_vnd)}</td><td><strong>{formatCreditFromMicros(BigInt(t.amount_micros) + BigInt(t.bonus_micros))}</strong></td><td><span className={`status-chip ${t.status === 'paid' ? 'success' : t.status === 'pending' ? 'warning' : 'danger'}`}>{t.status === 'paid' ? 'Thành công' : t.status === 'pending' ? 'Đang chờ' : t.status}</span></td><td>{t.status === 'pending' && <a href={`/dashboard/billing?topup=${t.id}`} className="btn secondary">Xem QR</a>}</td></tr>)}
        </tbody></table></div> : <div className="surface-body"><div className="empty-card"><div className="empty-icon">₫</div><strong>Chưa có giao dịch</strong><p>Lịch sử nạp tiền sẽ xuất hiện tại đây.</p></div></div>}
      </section>
    </div>
  )
}
