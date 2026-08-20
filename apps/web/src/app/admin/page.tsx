import { requireAdmin } from '@/lib/admin'
import { formatVndFromMicros, formatNumber } from '@/lib/money'
import { AdminConverter } from '@/components/AdminConverter'

export default async function AdminPage() {
  const { admin } = await requireAdmin()
  const [{ count: totalRequests }, { count: ambiguousCount }, { count: userCount }, { data: settledRows }, { data: models }, { data: routes }] = await Promise.all([
    admin.from('api_requests').select('*', { count: 'exact', head: true }),
    admin.from('api_requests').select('*', { count: 'exact', head: true }).eq('status', 'failed_ambiguous'),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('api_requests').select('retail_cost_micros,upstream_cost_micros').eq('status', 'settled'),
    admin.from('models').select('id,display_name,retail_flat_micros_per_mtoken').neq('status', 'disabled'),
    admin.from('provider_models').select('model_id,enabled,upstream_input_micros_per_mtoken,upstream_output_micros_per_mtoken').eq('enabled', true),
  ])
  const totalRevenue = (settledRows ?? []).reduce((acc: bigint, r: any) => acc + BigInt(r.retail_cost_micros || 0), 0n)
  const totalCost = (settledRows ?? []).reduce((acc: bigint, r: any) => acc + BigInt(r.upstream_cost_micros || 0), 0n)
  const grossProfit = totalRevenue - totalCost

  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Operations</div><h1>Tổng quan vận hành</h1><p>Doanh thu bán lẻ, chi phí upstream, lợi nhuận gộp và các request cần đối soát.</p></div></header>
    <div className="usage-summary">
      <div className="surface mini-stat"><span>Doanh thu</span><strong>{formatVndFromMicros(totalRevenue)}</strong></div>
      <div className="surface mini-stat"><span>Chi phí upstream</span><strong>{formatVndFromMicros(totalCost)}</strong></div>
      <div className="surface mini-stat"><span>Lợi nhuận gộp</span><strong>{formatVndFromMicros(grossProfit)}</strong></div>
      <div className="surface mini-stat"><span>Cần đối soát</span><strong>{formatNumber(ambiguousCount ?? 0)}</strong></div>
      <div className="surface mini-stat"><span>Khách hàng</span><strong>{formatNumber(userCount ?? 0)}</strong></div>
      <div className="surface mini-stat"><span>API requests</span><strong>{formatNumber(totalRequests ?? 0)}</strong></div>
    </div>
    <AdminConverter modelsData={(models ?? []).map((model: any) => { const route = (routes ?? []).find((item: any) => item.model_id === model.id); return { id: model.id, name: model.display_name, costPerM: route ? (Number(route.upstream_input_micros_per_mtoken) + Number(route.upstream_output_micros_per_mtoken)) / 2 / 1000 : null, retailPerM: Number(model.retail_flat_micros_per_mtoken ?? 0) / 1000 } })} />
  </div>
}
