import { requireAdmin } from '@/lib/admin'
import { formatVndFromMicros, formatNumber } from '@/lib/money'

export default async function AdminPage() {
  const { admin } = await requireAdmin()

  const [{ count: totalRequests }, { count: ambiguousCount }, { count: userCount }, { data: settledRows }] =
    await Promise.all([
      admin.from('api_requests').select('*', { count: 'exact', head: true }),
      admin.from('api_requests').select('*', { count: 'exact', head: true }).eq('status', 'failed_ambiguous'),
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('api_requests').select('retail_cost_micros,upstream_cost_micros').eq('status', 'settled'),
    ])

  const totalRevenue = (settledRows ?? []).reduce(
    (acc: bigint, r: any) => acc + BigInt(r.retail_cost_micros || 0),
    0n
  )
  const totalCost = (settledRows ?? []).reduce(
    (acc: bigint, r: any) => acc + BigInt(r.upstream_cost_micros || 0),
    0n
  )
  const grossProfit = totalRevenue - totalCost

  return (
    <div className="stack" style={{ gap: '28px' }}>
      <div>
        <h1>Chỉ Số Vận Hành Hệ Thống 📈</h1>
        <p className="muted">
          Theo dõi tổng doanh thu bán lẻ, chi phí vốn upstream, lợi nhuận gộp ước tính và các yêu cầu cần đối soát.
        </p>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <span className="muted">Doanh thu bán lẻ</span>
          <strong style={{ color: 'var(--primary)' }}>{formatVndFromMicros(totalRevenue)}</strong>
        </div>

        <div className="card kpi">
          <span className="muted">Chi phí vốn (Upstream)</span>
          <strong style={{ color: 'var(--warning)' }}>{formatVndFromMicros(totalCost)}</strong>
        </div>

        <div className="card kpi">
          <span className="muted">Lợi nhuận gộp (Gross Margin)</span>
          <strong style={{ color: 'var(--success)' }}>{formatVndFromMicros(grossProfit)}</strong>
        </div>

        <div className="card kpi">
          <span className="muted">Lượt cần đối soát (Ambiguous)</span>
          <strong style={{ color: (ambiguousCount ?? 0) > 0 ? 'var(--danger)' : 'var(--text-main)' }}>
            {formatNumber(ambiguousCount ?? 0)}
          </strong>
        </div>

        <div className="card kpi">
          <span className="muted">Tổng khách hàng</span>
          <strong>{formatNumber(userCount ?? 0)}</strong>
        </div>

        <div className="card kpi">
          <span className="muted">Tổng lượt gọi API</span>
          <strong>{formatNumber(totalRequests ?? 0)}</strong>
        </div>
      </div>
    </div>
  )
}
