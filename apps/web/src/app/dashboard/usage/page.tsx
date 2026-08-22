import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatCreditUsageFromMicros, formatNumber } from '@/lib/money'
import { formatVietnamDateTime } from '@/lib/date'

const PAGE_SIZE = 10

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase, user } = await requireUser()
  const params = await searchParams
  const requestedPage = Number(params.page ?? '1')
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const from = (page - 1) * PAGE_SIZE
  const { data: requests, count } = await supabase
    .from('api_requests')
    .select('id,channel,model_id,status,input_tokens,output_tokens,retail_cost_micros,error_code,created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const rows = requests ?? []
  const totalRows = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const totalTokens = rows.reduce((sum: number, request: any) => sum + (request.input_tokens ?? 0) + (request.output_tokens ?? 0), 0)
  const terminal = rows.filter((request: any) => ['settled', 'released', 'failed_ambiguous'].includes(request.status))
  const success = rows.filter((request: any) => request.status === 'settled').length
  const successRate = terminal.length ? Math.round((success / terminal.length) * 100) : 0

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Usage</div>
          <h1>Request logs và chi phí</h1>
          <p>Theo dõi từng lượt gọi, token và Credit đã trừ. Mỗi trang hiển thị 10 request mới nhất theo thứ tự thời gian.</p>
        </div>
      </header>

      <div className="usage-summary">
        <div className="surface mini-stat"><span>Tổng requests</span><strong>{formatNumber(totalRows)}</strong></div>
        <div className="surface mini-stat"><span>Token trên trang</span><strong>{formatNumber(totalTokens)}</strong></div>
        <div className="surface mini-stat"><span>Tỷ lệ settled trên trang</span><strong>{successRate}%</strong></div>
      </div>

      <section className="surface model-table-shell">
        <div className="surface-head"><h2>Request gần đây</h2><span className="status-chip">Trang {page} / {totalPages}</span></div>
        {rows.length > 0 ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Thời gian</th><th>Request ID</th><th>Kênh</th><th>Model</th><th>Input</th><th>Output</th><th>Chi phí</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {rows.map((request: any) => {
                    const state = request.status === 'settled'
                      ? ['success', 'Thành công']
                      : request.status === 'released'
                        ? ['', 'Đã hoàn tạm giữ']
                        : request.status === 'failed_ambiguous'
                          ? ['warning', 'Đang đối soát']
                          : ['warning', 'Đang xử lý']
                    return (
                      <tr key={request.id}>
                        <td>{formatVietnamDateTime(request.created_at)}</td>
                        <td><code>{request.id.slice(0, 8)}</code></td>
                        <td>{request.channel === 'playground' ? 'Playground' : 'API key'}</td>
                        <td><code>{request.model_id}</code></td>
                        <td>{formatNumber(request.input_tokens ?? 0)}</td>
                        <td>{formatNumber(request.output_tokens ?? 0)}</td>
                        <td><strong>{formatCreditUsageFromMicros(request.retail_cost_micros ?? '0')}</strong></td>
                        <td><span className={`status-chip ${state[0]}`}>{state[1]}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Phân trang request logs">
              {page > 1 ? <Link href={`/dashboard/usage?page=${page - 1}`} className="btn secondary">← Trang trước</Link> : <span />}
              <span>{formatNumber(from + 1)}–{formatNumber(Math.min(from + rows.length, totalRows))} / {formatNumber(totalRows)}</span>
              {page < totalPages ? <Link href={`/dashboard/usage?page=${page + 1}`} className="btn secondary">Trang sau →</Link> : <span />}
            </nav>
          </>
        ) : (
          <div className="surface-body"><div className="empty-card"><div className="empty-icon">R</div><strong>Chưa có request ở trang này</strong><p>Request từ Playground hoặc API key sẽ xuất hiện cùng token, chi phí và trạng thái.</p>{page > 1 && <Link href="/dashboard/usage" className="btn secondary">Về trang đầu</Link>}</div></div>
        )}
      </section>
    </div>
  )
}
