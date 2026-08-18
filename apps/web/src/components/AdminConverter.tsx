'use client'

import React, { useState } from 'react'

const modelsData = [
  { id: 'kimi-k2.6', name: 'Kimi K2.6', costPerM: 15, retailPerM: 300 },
  { id: 'deepseek-v4', name: 'DeepSeek V4', costPerM: 35, retailPerM: 800 },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', costPerM: 80, retailPerM: 2500 },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', costPerM: 200, retailPerM: 3000 },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', costPerM: 250, retailPerM: 3500 },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', costPerM: 330, retailPerM: 4000 },
]

export function AdminConverter() {
  const [a6Balance, setA6Balance] = useState<number>(4) // Mặc định 4$ hoặc 4S
  const [rateVndPerUsd, setRateVndPerUsd] = useState<number>(25400) // 1 USD / S = 25.400 VND

  const totalVndCost = a6Balance * rateVndPerUsd

  return (
    <div className="card stack" style={{ gap: '20px', background: 'var(--surface)' }}>
      <div className="row">
        <div>
          <h2 style={{ fontSize: '18px' }}>🧮 Bộ Quy Đổi Vốn Upstream A6API ⇋ VNĐ & Doanh Thu Lợi Nhuận</h2>
          <p className="muted" style={{ fontSize: '13px' }}>
            Nhập số dư ($ hoặc S) bạn đang có bên A6API để quy đổi chính xác ra tiền VNĐ và mức lãi thu về.
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
          Khi khách dùng hết {a6Balance}$ vốn này trên web, bạn sẽ thu về:
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Mô hình AI</th>
                <th>Giá vốn A6</th>
                <th>Giá bán lẻ</th>
                <th>Lượng Token phục vụ</th>
                <th>Doanh thu bán lẻ thu về</th>
                <th>Tiền lãi ròng (Gross Profit)</th>
                <th>Tỷ suất lãi</th>
              </tr>
            </thead>
            <tbody>
              {modelsData.map((m) => {
                // Số triệu token phục vụ được = Tổng tiền vốn VNĐ / Giá vốn 1M token
                const tokensServeM = totalVndCost > 0 ? totalVndCost / m.costPerM : 0
                // Doanh thu bán lẻ thu về = tokensServeM * Giá bán lẻ
                const revenue = tokensServeM * m.retailPerM
                // Tiền lời ròng = Doanh thu - Tiền vốn
                const profit = revenue - totalVndCost
                const multiplier = m.costPerM > 0 ? (m.retailPerM / m.costPerM).toFixed(1) : '0'

                return (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td className="muted">{new Intl.NumberFormat('vi-VN').format(m.costPerM)}đ / 1M</td>
                    <td style={{ fontWeight: 600 }}>{new Intl.NumberFormat('vi-VN').format(m.retailPerM)}đ / 1M</td>
                    <td>
                      <span className="badge">~{tokensServeM.toFixed(1)} triệu token</span>
                    </td>
                    <td style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      {new Intl.NumberFormat('vi-VN').format(Math.round(revenue))}đ
                    </td>
                    <td style={{ color: 'var(--success)', fontWeight: 700 }}>
                      +{new Intl.NumberFormat('vi-VN').format(Math.round(profit))}đ
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: 'var(--success-bg)',
                          color: 'var(--success)',
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
