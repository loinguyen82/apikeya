import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatCarrotFromMicros } from '@/lib/money'

function providerName(id: string, displayName: string) {
  const value = `${id} ${displayName}`.toLowerCase()
  if (value.includes('claude')) return 'Anthropic'
  if (value.includes('kimi')) return 'Kimi'
  if (value.includes('deepseek')) return 'DeepSeek'
  if (value.includes('gpt') || value.includes('openai')) return 'OpenAI'
  return 'Model'
}

export default async function ModelsPage() {
  const { supabase } = await requireUser()
  const { data: models } = await supabase
    .from('models')
    .select('*')
    .neq('status', 'disabled')
    .order('display_name')

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Model catalog</div>
          <h1>Chọn model theo nhu cầu và chi phí</h1>
          <p>Danh mục đang bật trên gateway. Giá được tính theo 1 triệu token và trừ theo mức sử dụng thực tế.</p>
        </div>
        <div className="page-actions">
          <Link href="/docs" className="btn secondary">Xem cách tích hợp</Link>
          <Link href="/dashboard/playground" className="btn">Mở Playground</Link>
        </div>
      </header>

      <section className="surface model-table-shell">
        <div className="surface-head">
          <h2>{models?.length ?? 0} model khả dụng</h2>
          <span className="status-chip success"><span className="status-dot" /> Gateway online</span>
        </div>
        {(models ?? []).length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Model</th><th>Provider</th><th>Giá / 1M token</th><th>Streaming</th><th></th></tr></thead>
              <tbody>
                {(models ?? []).map((m: any) => {
                  const provider = providerName(m.id, m.display_name)
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="model-primary">
                          <span className="provider-mark">{provider.slice(0, 1)}</span>
                          <span><strong>{m.display_name}</strong><small>{m.id}</small></span>
                        </div>
                      </td>
                      <td>{provider}</td>
                      <td>
                        {m.pricing_mode === 'flat_total' ? (
                          <><div className="price-main">{formatCarrotFromMicros(m.retail_flat_micros_per_mtoken)}</div><div className="price-sub">flat total</div></>
                        ) : (
                          <><div className="price-main">{formatCarrotFromMicros(m.retail_input_micros_per_mtoken)} in</div><div className="price-sub">{formatCarrotFromMicros(m.retail_output_micros_per_mtoken)} out</div></>
                        )}
                      </td>
                      <td><span className={`status-chip ${m.streaming_enabled ? 'success' : ''}`}>{m.streaming_enabled ? 'Hỗ trợ' : 'Không'}</span></td>
                      <td><Link href={`/dashboard/playground?model=${m.id}`} className="btn secondary">Dùng thử</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="surface-body"><div className="empty-card"><div className="empty-icon">M</div><strong>Chưa có model khả dụng</strong><p>Danh mục model hiện đang trống. Hãy quay lại sau hoặc kiểm tra cấu hình quản trị.</p></div></div>
        )}
      </section>
    </div>
  )
}
