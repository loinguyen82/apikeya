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
    .neq('status', 'disabled')
    .order('display_name')

  const safeModels = (models ?? []) as { id: string; display_name: string }[]
  const selected = safeModels.some((m) => m.id === params.model) ? params.model! : safeModels[0]?.id ?? ''

  return (
    <div className="stack" style={{ gap: '20px' }}>
      <div>
        <h1>Dùng thử Mô hình AI 🧪</h1>
        <p className="muted">
          Thử nghiệm prompt trực tiếp trên trình duyệt. Tiền được trừ tự động theo số token thực tế của phiên này.
        </p>
      </div>

      <PlaygroundClient models={safeModels} initialModel={selected} />
    </div>
  )
}
