'use client'

import { useState } from 'react'
import {
  DEFAULT_A6_RETAIL_MARKUP_VND_PER_MTOKEN,
  DEFAULT_A6_VND_PER_USD,
} from '@/lib/a6-marketplace'

type PricingRow = {
  modelId: string
  displayName: string
  sourceModel: string | null
  minInputPriceMicros: string | null
  inputCostVndPerMToken: number | null
  suggestedRetailVndPerMToken: number | null
  currentRetailVndPerMToken: number | null
  listingCount: number
}

function formatVnd(value: number | null): string {
  return value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)}đ`
}

export function A6MarketplacePricingClient() {
  const [rate, setRate] = useState(String(DEFAULT_A6_VND_PER_USD))
  const [markup, setMarkup] = useState(String(DEFAULT_A6_RETAIL_MARKUP_VND_PER_MTOKEN))
  const [rows, setRows] = useState<PricingRow[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [assumption, setAssumption] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ rate, markup })
      const response = await fetch(`/api/admin/marketplace-pricing?${query.toString()}`, { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Không đọc được giá Marketplace')
      setRows(json.models ?? [])
      setFetchedAt(json.fetchedAt ?? null)
      setAssumption(json.assumptions?.rawUnit ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được giá Marketplace')
    } finally {
      setLoading(false)
    }
  }

  return <section className="surface model-table-shell">
    <div className="surface-head">
      <div><div className="eyebrow">A6 Marketplace</div><h3>Giá vốn live (chỉ Admin)</h3></div>
      <button className="btn" type="button" onClick={refresh} disabled={loading}>{loading ? 'Đang lấy giá…' : 'Lấy giá mới nhất'}</button>
    </div>
    <div className="surface-body">
      <p className="muted" style={{ marginTop: 0 }}>Giá A6 được quy đổi để tham khảo. Xem nguồn tại <a href="https://a6api.com/marketplace" target="_blank" rel="noreferrer">A6 Marketplace</a>. Giá user vẫn lấy từ cột giá bán lẻ trong database; thao tác này không ghi đè giá user.</p>
      <div className="playground-controls" style={{ marginBottom: 14 }}>
        <div className="field"><label htmlFor="a6-marketplace-rate">Tỷ giá (VNĐ / 1 USD)</label><input id="a6-marketplace-rate" className="input" type="number" min="0" step="1" value={rate} onChange={(event) => setRate(event.target.value)} /></div>
        <div className="field"><label htmlFor="a6-marketplace-markup">Biên user (+VNĐ / 1M)</label><input id="a6-marketplace-markup" className="input" type="number" min="0" step="1" value={markup} onChange={(event) => setMarkup(event.target.value)} /></div>
      </div>
      {error && <p className="danger-text" role="alert">{error}</p>}
      {fetchedAt && <p className="muted" style={{ fontSize: 12 }}>Cập nhật: {new Date(fetchedAt).toLocaleString('vi-VN')}{assumption ? ` · ${assumption}` : ''}</p>}
    </div>
    {rows.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>Model</th><th>A6 route</th><th>A6 raw</th><th>Giá vốn input / 1M</th><th>Giá user đề xuất / 1M</th><th>Giá user hiện tại</th><th>Listings</th></tr></thead><tbody>{rows.map((row) => <tr key={row.modelId}><td><strong>{row.displayName}</strong><br /><code>{row.modelId}</code></td><td>{row.sourceModel ? <code>{row.sourceModel}</code> : 'Không có'}</td><td>{row.minInputPriceMicros ?? '—'}</td><td>{formatVnd(row.inputCostVndPerMToken)}</td><td>{formatVnd(row.suggestedRetailVndPerMToken)}</td><td>{formatVnd(row.currentRetailVndPerMToken)}</td><td>{row.listingCount}</td></tr>)}</tbody></table></div>}
  </section>
}
