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
    .select('id,display_name')
    .eq('status', 'active')
    .order('display_name')

  const safeModels = (models ?? []) as { id: string; display_name: string }[]
  const selected = safeModels.some((m) => m.id === params.model) ? params.model! : safeModels[0]?.id ?? ''

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow">Playground</div>
          <h1>Thử model trước khi tích hợp</h1>
          <p>Chọn model, gửi prompt và xem phản hồi trực tiếp. Phiên thử dùng tài khoản hiện tại và trừ theo token thực tế.</p>
        </div>
      </header>
      <PlaygroundClient models={safeModels} initialModel={selected} />
    </div>
  )
}
