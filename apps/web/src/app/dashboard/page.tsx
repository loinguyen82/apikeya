import Link from 'next/link'
import { CopyButton } from '@/components/CopyButton'
import { TideIcon } from '@/components/TideIcon'
import { requireUser } from '@/lib/auth'
import { formatCreditFromMicros, formatCreditUsageFromMicros, formatNumber, formatVnd } from '@/lib/money'
import { getA6LiveBalance } from '@/lib/a6'
import { isAdminUser } from '@/lib/admin'
import { formatVietnamDateTime } from '@/lib/date'

function statusLabel(status: string) {
  if (status === 'settled') return 'Thành công'
  if (status === 'failed_ambiguous') return 'Đang đối soát'
  if (status === 'reserved') return 'Đang xử lý'
  return status
}

export default async function DashboardPage() {
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech'
  const { supabase, user } = await requireUser()
  const [isAdmin, walletResult, countResult, requestsResult, keysResult, modelsResult] = await Promise.all([
    isAdminUser(supabase, user),
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).single(),
    supabase.from('api_requests').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('api_requests').select('id,model_id,retail_cost_micros,input_tokens,output_tokens,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('api_keys').select('id,name,prefix,status,last_used_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('models').select('id,display_name,status,streaming_enabled').neq('status', 'disabled').limit(4),
  ])

  let a6Live: { usd: number; vnd: number } | null = null
  if (isAdmin) {
    try { a6Live = await getA6LiveBalance() } catch { a6Live = null }
  }

  const wallet = walletResult.data
  const recentRequests = requestsResult.data ?? []
  const activeKey = (keysResult.data ?? []).find((key: any) => key.status === 'active')
  const models = modelsResult.data ?? []
  const availableMicros = BigInt(wallet?.available_micros ?? '0')
  const hasBalance = availableMicros > 0n
  const displayBalance = isAdmin && a6Live ? formatVnd(a6Live.vnd) : formatCreditFromMicros(wallet?.available_micros ?? '0')
  const keyPreview = activeKey ? `${activeKey.prefix}••••••••••••••••` : 'Chưa có API key đang hoạt động'

  return (
    <div className="page-stack">
      <header className="dashboard-head">
        <div>
          <h1>Tổng quan</h1>
          <p className="muted">Kiểm tra key, model, số dư và request gần nhất trong một màn hình.</p>
        </div>
        <div className="dashboard-actions">
          <Link href="/dashboard/playground" className="btn">Test model</Link>
          <Link href="/dashboard/api-keys" className="btn secondary">Quản lý API key</Link>
        </div>
      </header>

      <section className="overview-band">
        <div className="balance-pane">
          <small>Số dư khả dụng</small>
          <div className="balance-value">{displayBalance}</div>
          <div className="balance-meta">
            <span>{formatNumber(countResult.count ?? 0)} request</span>
            <span>{formatCreditFromMicros(wallet?.reserved_micros ?? '0')} đang tạm giữ</span>
            {isAdmin && a6Live && <span>A6 live · ${a6Live.usd.toFixed(2)} USD</span>}
          </div>
        </div>
        <div className="credential-pane">
          <div className="credential-pane-head">
            <div><small>Credential đang dùng</small><h2>{activeKey?.name ?? 'API key'}</h2></div>
            <span className={`status-chip ${activeKey ? 'success' : 'warning'}`}><span className="status-dot" />{activeKey ? 'Đang hoạt động' : 'Chưa tạo'}</span>
          </div>
          <div className="credential-row"><code>{keyPreview}</code>{activeKey && <Link href="/dashboard/api-keys" className="btn secondary">Xem key</Link>}</div>
          <div className="credential-row"><code>{gatewayUrl}/v1</code><CopyButton value={`${gatewayUrl}/v1`} compact /></div>
          <p className="credential-hint">API key đầy đủ chỉ hiển thị đúng một lần khi tạo hoặc rotate.</p>
        </div>
      </section>

      {!hasBalance && !isAdmin && (
        <div className="notice warning">
          Checkout hiện là mô phỏng vì PayOS chưa được kết nối. Bạn có thể xem toàn bộ flow nhưng thao tác demo sẽ không cộng số dư thật.
        </div>
      )}

      <section className="console-flow" aria-label="Quy trình bắt đầu">
        <div className="console-flow-step"><span className="step-number">01</span><strong>Nạp số dư</strong><span>Checkout đang mô phỏng tới khi có PayOS.</span><TideIcon name="arrow" /></div>
        <div className="console-flow-step"><span className="step-number">02</span><strong>Tạo key & chọn model</strong><span>Lấy credential rồi copy cấu hình sẵn.</span><TideIcon name="arrow" /></div>
        <div className="console-flow-step"><span className="step-number">03</span><strong>Gửi request</strong><span>Test trước, theo dõi logs sau.</span></div>
      </section>

      <div className="dashboard-grid">
        <div className="page-stack">
          <section className="dashboard-list">
            <div className="dashboard-list-head"><h2>Model khả dụng</h2><Link href="/dashboard/models">Xem tất cả →</Link></div>
            {models.length ? models.map((model: any) => (
              <div className="model-row-compact" key={model.id}>
                <span><strong>{model.display_name}</strong><small style={{ display: 'block' }}><code>{model.id}</code></small></span>
                <span className={`status-chip ${model.status === 'active' ? 'success' : 'warning'}`}>{model.status === 'active' ? 'Online' : 'Suy giảm'}</span>
                <small>{model.streaming_enabled ? 'Streaming' : 'Non-stream'}</small>
                <Link href={`/dashboard/playground?model=${model.id}`} className="btn secondary">Test</Link>
              </div>
            )) : <div className="empty-state"><strong>Chưa có model khả dụng</strong><p>Gateway chưa trả về model đang hoạt động.</p></div>}
          </section>

          <section className="dashboard-list">
            <div className="dashboard-list-head"><h2>Request gần đây</h2><Link href="/dashboard/usage">Mở logs →</Link></div>
            {recentRequests.length ? recentRequests.map((request: any) => (
              <div className="request-row" key={request.id}>
                <span><strong>{formatVietnamDateTime(request.created_at)}</strong></span>
                <code>{request.model_id}</code>
                <small>{formatNumber((request.input_tokens ?? 0) + (request.output_tokens ?? 0))} token</small>
                <strong>{formatCreditUsageFromMicros(request.retail_cost_micros ?? '0')}</strong>
                <span className={`status-chip ${request.status === 'settled' ? 'success' : request.status === 'failed_ambiguous' ? 'warning' : ''}`}>{statusLabel(request.status)}</span>
              </div>
            )) : <div className="empty-state"><strong>Chưa có request nào</strong><p>Chọn một model trong Playground để gửi request đầu tiên.</p><Link href="/dashboard/playground" className="btn">Mở Playground</Link></div>}
          </section>
        </div>

        <aside className="ops-rail">
          <div className="dashboard-list-head"><h2>Trạng thái & hướng dẫn</h2></div>
          <div className="ops-item"><span className="mock-badge">Chưa kết nối PayOS</span><strong style={{ marginTop: 9 }}>Thanh toán mô phỏng</strong><p>Checkout demo không gửi QR ngân hàng, không tạo webhook và không cộng wallet.</p><Link href="/dashboard/billing">Mở flow nạp tiền →</Link></div>
          <div className="ops-item"><span className={`status-chip ${activeKey ? 'success' : 'warning'}`}><span className="status-dot" /> API key</span><strong style={{ marginTop: 9 }}>{activeKey ? 'Một key đang hoạt động' : 'Chưa có key đang hoạt động'}</strong><p>{activeKey ? 'Rotate hoặc revoke không làm mất lịch sử request và số dư tài khoản.' : 'Tài khoản cần số dư thật trước khi có thể tạo API key đầu tiên.'}</p><Link href="/dashboard/api-keys">Quản lý key →</Link></div>
          <div className="ops-item"><span className="status-chip"><span className="status-dot" /> Quick config</span><strong style={{ marginTop: 9 }}>Không cần sửa SDK</strong><p>Chọn Codex, Claude Code, OpenCode hoặc Roo rồi copy cấu hình.</p><Link href="/dashboard/config">Tạo cấu hình →</Link></div>
        </aside>
      </div>
    </div>
  )
}
