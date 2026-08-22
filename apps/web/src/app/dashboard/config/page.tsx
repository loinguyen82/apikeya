import { ConfigGenerator } from '@/components/ConfigGenerator'
import { requireUser } from '@/lib/auth'

export default async function ConfigPage() {
  const { supabase, user } = await requireUser()
  const [{ data: models }, { data: key }] = await Promise.all([
    supabase.from('models').select('id,display_name').eq('status', 'active').order('display_name'),
    supabase.from('api_keys').select('prefix').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  return (
    <div className="page-stack">
      <header className="page-head">
        <div className="page-head-copy"><div className="eyebrow">Quick config</div><h1>Cấu hình sẵn theo công cụ</h1><p>Chọn ứng dụng, model rồi copy đúng block cấu hình cho endpoint APIVN.</p></div>
      </header>
      <ConfigGenerator models={models ?? []} keyPrefix={key?.prefix} gatewayBaseUrl={process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech'} />
    </div>
  )
}
