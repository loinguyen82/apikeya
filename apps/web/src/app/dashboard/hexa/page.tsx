import { HexaClientV2 } from '@/components/HexaClientV2'
import { TokenizedBackdrop } from '@/components/TokenizedBackdrop'
import { requireUser } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'

export default async function HexaPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>
}) {
  const { supabase } = await requireUser()
  const params = await searchParams
  const admin = createAdminSupabase()
  const { data: providerRoutes } = await admin
    .from('provider_models')
    .select('model_id,providers!inner(status)')
    .eq('enabled', true)

  const routableModelIds = [...new Set((providerRoutes ?? []).flatMap((route: any) => (
    route.providers?.status === 'disabled' ? [] : [route.model_id]
  )))]

  const { data: models } = routableModelIds.length > 0
    ? await supabase
      .from('models')
      .select('id,display_name,context_window_tokens,tokenizer_family')
      .neq('status', 'disabled')
      .in('id', routableModelIds)
      .order('display_name')
    : { data: [] as Array<{ id: string; display_name: string; context_window_tokens: number | null; tokenizer_family: string | null }> }

  const activeModels = (models ?? []).map((model: {
    id: string
    display_name: string
    context_window_tokens: number | null
    tokenizer_family: string | null
  }) => ({
    id: model.id,
    displayName: model.display_name,
    contextWindowTokens: model.context_window_tokens,
    tokenizerFamily: model.tokenizer_family,
  }))

  const initialModel = activeModels.some((model) => model.id === params.model)
    ? params.model!
    : activeModels[0]?.id ?? ''

  return (
    <TokenizedBackdrop>
      <HexaClientV2 models={activeModels} initialModel={initialModel} />
    </TokenizedBackdrop>
  )
}
