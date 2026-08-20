import { requireAdmin } from '@/lib/admin'
import { formatVndFromMicros } from '@/lib/money'

export default async function AdminModelsPage() {
  const { admin } = await requireAdmin()

  const [{ data: models }, { data: routes }] = await Promise.all([
    admin
      .from('models')
      .select('id,display_name,status,pricing_mode,retail_flat_micros_per_mtoken,streaming_enabled')
      .order('display_name'),
    admin
      .from('provider_models')
      .select('provider_id,model_id,upstream_model,priority,enabled,supports_stream_usage,upstream_input_micros_per_mtoken,upstream_output_micros_per_mtoken')
      .order('model_id'),
  ])

  return (
    <div className="stack" style={{ gap: '32px' }}>
      <div>
        <h1>Quản Lý Mô Hình & Định Tuyến Nhà Cung Cấp ⚙️</h1>
        <p className="muted">
          Cấu hình giá bán lẻ, ưu tiên routing và giá vốn upstream mà không cần deploy lại code.
        </p>
      </div>

      <div className="card stack">
        <h3>1. Danh Mục Mô Hình Bán Lẻ (Models)</h3>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ID Model</th>
              <th>Tên hiển thị</th>
              <th>Trạng thái</th>
              <th>Biểu phí bán lẻ</th>
              <th>Hỗ trợ Stream</th>
            </tr>
          </thead>
          <tbody>
            {(models ?? []).map((m: any) => (
              <tr key={m.id}>
                <td><code>{m.id}</code></td>
                <td style={{ fontWeight: 600 }}>{m.display_name}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: m.status === 'active' ? 'var(--success-bg)' : 'var(--danger-bg)',
                      color: m.status === 'active' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {m.status}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>
                  {m.retail_flat_micros_per_mtoken ? formatVndFromMicros(m.retail_flat_micros_per_mtoken) : 'Theo I/O'}
                </td>
                <td>{m.streaming_enabled ? '✓ Có' : '✗ Không'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="card stack">
        <h3>2. Cấu Hình Tuyến Upstream (Provider Routes)</h3>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Model Public</th>
              <th>Provider</th>
              <th>Upstream Model</th>
              <th>Ưu tiên (Priority)</th>
              <th>Giá vốn / 1M token</th>
              <th>Stream Usage</th>
              <th>Bật/Tắt</th>
            </tr>
          </thead>
          <tbody>
            {(routes ?? []).map((r: any) => (
              <tr key={`${r.provider_id}-${r.model_id}`}>
                <td><code>{r.model_id}</code></td>
                <td><span className="badge">{r.provider_id}</span></td>
                <td><code>{r.upstream_model}</code></td>
                <td>{r.priority}</td>
                <td>{formatVndFromMicros(r.upstream_input_micros_per_mtoken)}</td>
                <td>{r.supports_stream_usage ? '✓ Hỗ trợ' : '✗ Không'}</td>
                <td>{r.enabled ? '✓ Đang bật' : '✗ Đang tắt'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
