import { requireUser } from '@/lib/auth'
import { PlaygroundClient } from '@/components/PlaygroundClient'

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>
}) {
  const { supabase } = await requireUser()
  const params = await searchParams
  const { data: models } = await supabase
    .from('models')
    .select('id,display_name,default_max_output_tokens,max_output_tokens')
    .eq('status', 'active')
    .order('display_name')

  const safeModels = (models ?? []) as { id: string; display_name: string; default_max_output_tokens: number; max_output_tokens: number }[]
  const selected = safeModels.some((m) => m.id === params.model) ? params.model! : safeModels[0]?.id ?? ''

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Playground</div>
          <h1>Thử model trước khi tích hợp</h1>
          <p>Chọn model, chỉnh tham số và xem latency, tokens, cost từ gateway thật.</p>
        </div>
      </header>
      <PlaygroundClient models={safeModels} initialModel={selected} baseUrl={`${(process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech').replace(/\/+$/, '')}/v1`} />
    </div>
  )
}
