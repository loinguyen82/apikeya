'use client'

import React, { useState } from 'react'
import { formatVietnamDateTime } from '@/lib/date'
import { formatVnd, formatVndFromMicros, formatCreditFromMicros, formatCreditFromVnd } from '@/lib/money'
import { defaultBankConfig, generateVietQrUrl } from '@/lib/bank-config'

interface TopupData {
  id: string
  payable_vnd: number
  amount_micros: string
  bonus_micros: string
  status: string
  created_at: string
  expires_at: string
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
  const [selectedAmount, setSelectedAmount] = useState<number>(100000)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [copyError, setCopyError] = useState(false)
  const [creating, setCreating] = useState(false)

  const packages = [
    { amount: 50000, label: '🥕 50 Credit', bonus: 0, bonusLabel: '50.000đ · Tiêu chuẩn' },
    { amount: 100000, label: '🥕 100 Credit', bonus: 0, bonusLabel: '100.000đ · Phổ biến nhất' },
    { amount: 200000, label: '🥕 200 Credit', bonus: 0, bonusLabel: '200.000đ · Tiết kiệm' },
    { amount: 500000, label: '🥕 525 Credit', bonus: 25000, bonusLabel: '500.000đ · +5% thưởng' },
    { amount: 1000000, label: '🥕 1.100 Credit', bonus: 100000, bonusLabel: '1.000.000đ · +10% thưởng' },
    { amount: 2000000, label: '🥕 2.300 Credit', bonus: 300000, bonusLabel: '2.000.000đ · +15% thưởng' },
  ]

  async function copyToClipboard(text: string, field: string) {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      setCopyError(true)
    }
  }

  const memo = currentTopup ? `NAP ${currentTopup.id.slice(0, 8).toUpperCase()}` : ''
  const topupExpired = currentTopup ? new Date(currentTopup.expires_at) <= new Date() : false
  const qrUrl = currentTopup
    && !topupExpired
    ? generateVietQrUrl({
        amount: currentTopup.payable_vnd,
        memo,
      })
    : ''

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div>
        <h1>Nạp Số Dư Dịch Vụ 💳</h1>
        <p className="muted">
          Chuyển khoản qua ngân hàng (VietQR). Admin sẽ xác nhận và cộng credit vào tài khoản của bạn ngay khi nhận được giao dịch.
        </p>
        <p className="credit-note">🥕 1 Credit = 1.000đ · Credit không hết hạn và được trừ theo token thực tế.</p>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <span className="muted">🥕 Credit hiện tại</span>
          <strong style={{ color: 'var(--primary-hover)', fontSize: '32px' }}>
            {formatCreditFromMicros(wallet?.available_micros ?? '0')}
          </strong>
          <span className="muted" style={{ fontSize: '13px' }}>
            Đang tạm giữ xử lý: {formatCreditFromMicros(wallet?.reserved_micros ?? '0')}
          </span>
        </div>

        <div className="card stack" style={{ gridColumn: 'span 2', gap: '16px' }}>
          <h3>1. Chọn gói nạp số dư</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            {packages.map((pkg) => {
              const isSelected = selectedAmount === pkg.amount
              return (
                <button
                  key={pkg.amount}
                  type="button"
                  onClick={() => setSelectedAmount(pkg.amount)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--line)',
                    background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-subtle)',
                    color: isSelected ? 'var(--primary-hover)' : 'var(--text-main)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{pkg.label}</div>
                  <div
                    style={{
                      fontSize: '11px',
                      marginTop: '4px',
                      color: pkg.bonus > 0 ? 'var(--success)' : 'var(--text-muted)',
                      fontWeight: pkg.bonus > 0 ? 600 : 400,
                    }}
                  >
                    {pkg.bonusLabel}
                  </div>
                </button>
              )
            })}
          </div>

          <form action="/api/topups" method="post" onSubmit={() => setCreating(true)}>
            <input type="hidden" name="amount" value={selectedAmount} />
            <button className="btn" type="submit" disabled={creating} style={{ width: '100%', padding: '12px' }}>
              {creating ? 'Đang tạo đơn nạp...' : `Tạo yêu cầu nạp ${formatVnd(selectedAmount)} = ${formatCreditFromVnd(selectedAmount)} (VietQR) →`}
            </button>
          </form>
        </div>
      </div>

      {/* KHUNG HIỂN THỊ ĐƠN NẠP VÀ MÃ VIETQR */}
      {currentTopup && (
        <div
          className="card stack"
          style={{
            border: '2px solid var(--primary)',
            background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.04) 0%, rgba(15, 23, 42, 0.02) 100%)',
            gap: '20px',
          }}
        >
          <div className="row">
            <div>
              <div className="row" style={{ gap: '8px' }}>
                <span className="badge" style={{ background: 'var(--primary)', color: '#fff' }}>
                  Đơn nạp #{currentTopup.id.slice(0, 8).toUpperCase()}
                </span>
                <span
                  className="badge"
                  style={{
                    background: currentTopup.status === 'paid' ? 'var(--success-bg)' : topupExpired ? 'var(--danger-bg)' : 'var(--warning-bg)',
                    color: currentTopup.status === 'paid' ? 'var(--success)' : topupExpired ? 'var(--danger)' : 'var(--warning)',
                    fontWeight: 600,
                  }}
                >
                  {currentTopup.status === 'paid' ? '✓ ĐÃ DUYỆT THÀNH CÔNG' : topupExpired ? 'ĐÃ HẾT HẠN' : '⏳ ĐANG CHỜ CHUYỂN KHOẢN'}
                </span>
              </div>
              <h2 style={{ fontSize: '18px', marginTop: '6px' }}>Thông tin chuyển khoản ngân hàng</h2>
            </div>
            {currentTopup.status === 'paid' && (
              <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '16px' }}>
                +
                {formatCreditFromMicros(
                  BigInt(currentTopup.amount_micros) + BigInt(currentTopup.bonus_micros)
                )}{' '}
                đã vào ví
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {/* Cột Trái: Mã QR */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              {topupExpired ? (
                <div className="empty-state" style={{ minHeight: '220px', justifyContent: 'center' }}>
                  <strong>Đơn nạp đã hết hạn</strong>
                  <span className="muted">Tạo một yêu cầu mới để nhận mã QR hợp lệ.</span>
                </div>
              ) : <div
                style={{
                  background: '#fff',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  display: 'inline-block',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt="Mã VietQR nạp tiền"
                  style={{ width: '220px', height: '220px', display: 'block', objectFit: 'contain' }}
                />
              </div>}
              <span className="muted" style={{ fontSize: '12px', textAlign: 'center' }}>
                📱 Mở App ngân hàng bất kỳ để quét mã tự động điền thông tin
              </span>
            </div>

            {/* Cột Phải: Chi tiết chuyển khoản thủ công */}
            <div className="stack" style={{ gap: '14px', justifyContent: 'center' }}>
              <div
                style={{
                  background: 'var(--bg)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Ngân hàng:</span>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{defaultBankConfig.bankName}</div>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Số tài khoản:</span>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary-hover)' }}>
                    {defaultBankConfig.accountNo}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => copyToClipboard(defaultBankConfig.accountNo, 'accNo')}
                >
                  {copiedField === 'accNo' ? '✓ Đã copy' : 'Sao chép'}
                </button>
              </div>

              <div
                style={{
                  background: 'var(--bg)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Chủ tài khoản:</span>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{defaultBankConfig.accountName}</div>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span className="muted" style={{ fontSize: '12px' }}>Số tiền:</span>
                  <div style={{ fontWeight: 700, fontSize: '17px', color: 'var(--success)' }}>
                    {formatVnd(currentTopup.payable_vnd)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => copyToClipboard(String(currentTopup.payable_vnd), 'amount')}
                >
                  {copiedField === 'amount' ? '✓ Đã copy' : 'Sao chép'}
                </button>
              </div>

              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px dashed var(--primary)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                    Nội dung chuyển khoản (Bắt buộc):
                  </span>
                  <div style={{ fontWeight: 800, fontSize: '18px', fontFamily: 'var(--font-mono)' }}>{memo}</div>
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => copyToClipboard(memo, 'memo')}
                >
                  {copiedField === 'memo' ? '✓ Đã copy' : 'Sao chép'}
                </button>
              </div>
            </div>
          </div>

          {copyError && <p className="muted" role="alert">Không thể tự động sao chép. Vui lòng sao chép nội dung thủ công.</p>}

          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              color: 'var(--warning)',
              lineHeight: 1.5,
            }}
          >
            ⚠️ <strong>Lưu ý quan trọng:</strong> Vui lòng điền <strong>chính xác nội dung chuyển khoản</strong> ({memo}) để Admin kiểm tra và duyệt credit tự động cho bạn nhanh nhất. Sau khi chuyển tiền, bạn có thể tải lại trang sau 1–3 phút để xem số dư mới.
          </div>
        </div>
      )}

      {/* BẢNG LỊCH SỬ GIAO DỊCH */}
      <div className="card stack">
        <h3>Lịch sử giao dịch nạp tiền</h3>
        {recentTopups && recentTopups.length > 0 ? (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mã giao dịch</th>
                <th>Số tiền nạp</th>
                <th>Credit nhận được</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {recentTopups.map((t) => (
                <tr key={t.id}>
                  <td>{formatVietnamDateTime(t.created_at)}</td>
                  <td>
                    <code>{t.id.slice(0, 8).toUpperCase()}</code>
                  </td>
                  <td>{formatVnd(t.payable_vnd)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatCreditFromMicros(BigInt(t.amount_micros) + BigInt(t.bonus_micros))}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          t.status === 'paid'
                            ? 'var(--success-bg)'
                            : t.status === 'pending'
                            ? 'var(--warning-bg)'
                            : 'var(--danger-bg)',
                        color:
                          t.status === 'paid'
                            ? 'var(--success)'
                            : t.status === 'pending'
                            ? 'var(--warning)'
                            : 'var(--danger)',
                        fontWeight: 600,
                      }}
                    >
                      {t.status === 'paid'
                        ? '✓ Thành công'
                        : t.status === 'pending'
                        ? '⏳ Chờ duyệt'
                        : t.status}
                    </span>
                  </td>
                  <td>
                    {t.status === 'pending' && (
                      <a
                        href={`/dashboard/billing?topup=${t.id}`}
                        className="btn secondary"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Xem mã QR →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Bạn chưa có giao dịch nạp tiền nào.
          </div>
        )}
      </div>
    </div>
  )
}
