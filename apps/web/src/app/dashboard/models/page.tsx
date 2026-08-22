import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatCarrotFromMicros } from '@/lib/money'

export default async function ModelsPage() {
  const { supabase } = await requireUser()

  const { data: models } = await supabase
    .from('models')
    .select('*')
    .neq('status', 'disabled')
    .order('display_name')

  return (
    <div className="stack" style={{ gap: '24px' }}>
      <div>
        <h1>Danh mục Mô hình AI 🤖</h1>
        <p className="muted">
          Giá được niêm yết theo carrot trên mỗi 1 triệu token. Token là đơn vị đo lường độ dài văn bản của AI.
        </p>
      </div>

      <div className="grid">
        {(models ?? []).map((m: any) => (
          <div className="card stack" key={m.id} style={{ justifyContent: 'space-between' }}>
            <div className="stack" style={{ gap: '12px' }}>
              <div className="row">
                <span className="badge">{(m.tags ?? [])[0] ?? 'AI'}</span>
                <code className="muted" style={{ fontSize: '13px' }}>{m.id}</code>
              </div>
              <h3>{m.display_name}</h3>
              <p className="muted" style={{ fontSize: '14px' }}>{m.description}</p>
              <div className="price">
                {m.pricing_mode === 'flat_total'
                  ? formatCarrotFromMicros(m.retail_flat_micros_per_mtoken)
                  : `${formatCarrotFromMicros(m.retail_input_micros_per_mtoken)} (in) / ${formatCarrotFromMicros(m.retail_output_micros_per_mtoken)} (out)`}
                <span className="muted" style={{ fontSize: '13px', fontWeight: 400 }}> / 1M token</span>
              </div>
            </div>

            <div className="row" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <span className="muted" style={{ fontSize: '13px' }}>
                {m.streaming_enabled ? '✓ Hỗ trợ Streaming' : '⚡ Non-stream'}
              </span>
              <Link href={`/dashboard/hexa?model=${encodeURIComponent(m.id)}`} className="btn secondary" style={{ padding: '6px 14px', fontSize: '13px' }}>
                Phân tích token →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
