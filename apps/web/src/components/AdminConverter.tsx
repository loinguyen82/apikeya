'use client'

import React, { useState } from 'react'

type ConverterModel = {
  id: string
  name: string
  costPerM: number | null
  retailPerM: number
}

export function AdminConverter({ modelsData }: { modelsData: ConverterModel[] }) {
  const [a6Balance, setA6Balance] = useState<number>(4) // Mặc định 4$ hoặc 4S
  const [rateVndPerUsd, setRateVndPerUsd] = useState<number>(25400) // 1 USD / S = 25.400 VND

  const totalVndCost = a6Balance * rateVndPerUsd

  return (
    <div className="card stack" style={{ gap: '20px', background: 'var(--surface)' }}>
      <div className="row">
        <div>
          <h2 style={{ fontSize: '18px' }}>🧮 Bộ Quy Đổi Vốn Upstream A6API ⇋ VNĐ & Doanh Thu Lợi Nhuận</h2>
          <p className="muted" style={{ fontSize: '13px' }}>
            Ước tính theo giá vốn đang lưu trong database. Giá vốn blended giả định input/output 50/50; chưa gồm phí thanh toán, tỷ giá và vận hành.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Số dư A6API của bạn ($ hoặc S)
          </label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.5"
            value={a6Balance}
            onChange={(e) => setA6Balance(Math.max(0, Number(e.target.value)))}
          />
        </div>

        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Tỷ giá mua vốn (VNĐ / 1$ A6)
          </label>
          <input
            className="input"
            type="number"
            step="100"
            value={rateVndPerUsd}
            onChange={(e) => setRateVndPerUsd(Math.max(1, Number(e.target.value)))}
          />
        </div>

        <div style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: 'var(--radius-sm)' }}>
          <span className="muted" style={{ fontSize: '12px' }}>Giá trị vốn thực tế:</span>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>
            {new Intl.NumberFormat('vi-VN').format(totalVndCost)}đ
          </div>
          <span className="muted" style={{ fontSize: '11px' }}>
            = {a6Balance}$ × {new Intl.NumberFormat('vi-VN').format(rateVndPerUsd)}đ
          </span>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>
          Nếu khách dùng hết {a6Balance}$ vốn này trên web, doanh thu và lãi gộp ước tính là:
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Mô hình AI</th>
                <th>Giá vốn blended</th>
                <th>Giá bán lẻ</th>
                <th>Lượng Token phục vụ</th>
                <th>Doanh thu bán lẻ thu về</th>
                <th>Tiền lãi ròng (Gross Profit)</th>
                <th>Tỷ suất lãi</th>
              </tr>
            </thead>
            <tbody>
              {modelsData.map((m) => {
                const tokensServeM = totalVndCost > 0 && m.costPerM ? totalVndCost / m.costPerM : 0
                // Doanh thu bán lẻ thu về = tokensServeM * Giá bán lẻ
                const revenue = tokensServeM * m.retailPerM
                // Tiền lời ròng = Doanh thu - Tiền vốn
                const profit = m.costPerM ? revenue - totalVndCost : 0
                const multiplier = m.costPerM ? (m.retailPerM / m.costPerM).toFixed(1) : '—'

                return (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td className="muted">{m.costPerM == null ? 'Chưa cấu hình' : `${new Intl.NumberFormat('vi-VN').format(m.costPerM)}đ / 1M`}</td>
                    <td style={{ fontWeight: 600 }}>{new Intl.NumberFormat('vi-VN').format(m.retailPerM)}đ / 1M</td>
                    <td>
                      <span className="badge">~{tokensServeM.toFixed(1)} triệu token</span>
                    </td>
                    <td style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      {new Intl.NumberFormat('vi-VN').format(Math.round(revenue))}đ
                    </td>
                    <td style={{ color: profit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                      {profit >= 0 ? '+' : ''}{new Intl.NumberFormat('vi-VN').format(Math.round(profit))}đ
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: m.costPerM && profit >= 0 ? 'var(--success-bg)' : 'var(--warning-bg)',
                          color: m.costPerM && profit >= 0 ? 'var(--success)' : 'var(--warning)',
                          borderColor: 'rgba(16,185,129,0.3)',
                          fontWeight: 700,
                        }}
                      >
                        x{multiplier} lần
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
