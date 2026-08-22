import Link from 'next/link'
import { CopyButton } from '@/components/CopyButton'
import { requireUser } from '@/lib/auth'
import { formatNumber, formatVndFromMicros } from '@/lib/money'

function providerName(id: string, displayName: string) {
  const value = `${id} ${displayName}`.toLowerCase()
  if (value.includes('claude')) return 'Anthropic'
  if (value.includes('kimi')) return 'Moonshot'
  if (value.includes('deepseek')) return 'DeepSeek'
  if (value.includes('gemini')) return 'Google'
  if (value.includes('glm')) return 'Zhipu AI'
  if (value.includes('gpt') || value.includes('openai')) return 'OpenAI'
  return 'APIVN route'
}

function status(modelStatus: string) {
  if (modelStatus === 'active') return ['success', 'Online']
  if (modelStatus === 'degraded') return ['warning', 'Degraded']
  return ['danger', 'Offline']
}

export default async function ModelsPage() {
  const { supabase } = await requireUser()
  const { data: models } = await supabase.from('models').select('*').neq('status', 'disabled').order('retail_flat_micros_per_mtoken', { ascending: true })
  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Models</div><h1>Model catalog</h1><p>Chọn model theo context, trạng thái và giá. Model ID dùng trực tiếp trong request OpenAI-compatible.</p></div><Link href="/dashboard/playground" className="btn">Mở Playground</Link></header>
    <section className="surface model-table-shell"><div className="surface-head"><h2>{models?.length ?? 0} models</h2><span className="status-chip"><span className="status-dot" /> Live catalog</span></div>{(models ?? []).length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Model</th><th>Provider</th><th>Context</th><th>Input price</th><th>Output price</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(models ?? []).map((model: any) => {
      const provider = providerName(model.id, model.display_name)
      const state = status(model.status)
      const inputPrice = model.retail_input_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken
      const outputPrice = model.retail_output_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken
      return <tr key={model.id}><td><div className="model-primary"><span className="provider-mark">{provider.slice(0, 1)}</span><span><strong>{model.display_name}</strong><small>{model.id}</small></span></div></td><td>{provider}</td><td>{model.context_window ? `${formatNumber(model.context_window / 1000)}K` : '—'}</td><td><strong>{formatVndFromMicros(inputPrice)}</strong><div className="price-sub">/ 1M tokens</div></td><td><strong>{formatVndFromMicros(outputPrice)}</strong><div className="price-sub">/ 1M tokens</div></td><td><span className={`status-chip ${state[0]}`}>{state[1]}</span></td><td><div className="table-actions"><Link href={`/dashboard/playground?model=${model.id}`} className="text-button">Test</Link><CopyButton value={model.id} compact /><Link href="/#pricing" className="text-button">Pricing</Link></div></td></tr>
    })}</tbody></table></div> : <div className="surface-body"><div className="empty-card"><div className="empty-icon">M</div><strong>Chưa có model khả dụng</strong><p>Model catalog đang trống. Hãy thử lại sau.</p></div></div>}</section>
  </div>
}
