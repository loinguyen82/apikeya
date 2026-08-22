import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandLogo } from '@/components/BrandLogo'
import { createServerSupabase } from '@/lib/supabase/server'
import { formatVndFromMicros } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Danh sách model AI API tại Việt Nam',
  description: 'Danh sách model AI đang có trên APIVN: Claude, GPT, Kimi, DeepSeek và các model tương thích OpenAI. Xem trạng thái và giá theo 1M token.',
  alternates: { canonical: '/models' },
  openGraph: {
    title: 'Danh sách model AI API | APIVN.tech',
    description: 'Xem model AI, trạng thái và giá API theo 1M token trên APIVN.tech.',
    url: '/models',
  },
}

function providerName(id: string) {
  const value = id.toLowerCase()
  if (value.includes('claude')) return 'Anthropic'
  if (value.includes('kimi')) return 'Moonshot'
  if (value.includes('deepseek')) return 'DeepSeek'
  if (value.includes('gemini')) return 'Google'
  if (value.includes('glm')) return 'Zhipu AI'
  if (value.includes('grok')) return 'xAI'
  if (value.includes('qwen')) return 'Alibaba'
  if (value.includes('minimax')) return 'MiniMax'
  if (value.includes('gpt')) return 'OpenAI'
  return 'APIVN route'
}

export default async function ModelsPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('models')
    .select('id,display_name,status,retail_flat_micros_per_mtoken,retail_input_micros_per_mtoken,retail_output_micros_per_mtoken')
    .neq('status', 'disabled')
    .order('display_name')

  const models = data ?? []
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'APIVN AI model catalog',
    itemListElement: models.map((model: any, index: number) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: model.display_name,
      url: `https://apivn.tech/models#${encodeURIComponent(model.id)}`,
    })),
  }

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
    <header className="public-header"><div className="public-header-inner"><BrandLogo /><nav className="public-nav" aria-label="Điều hướng chính"><Link href="/models">Models</Link><Link href="/pricing">Pricing</Link><Link href="/status">Status</Link><Link href="/docs">Docs</Link></nav><div className="public-actions"><Link href="/login" className="btn secondary">Đăng nhập</Link><Link href="/signup" className="btn">Bắt đầu</Link></div></div></header>
    <main className="landing-main">
      <section className="landing-section">
        <div className="section-intro"><div className="eyebrow">AI model catalog</div><h1>Model AI API trên APIVN.</h1><p>Một Base URL cho nhiều model. Catalog và pricing bên dưới lấy trực tiếp từ dữ liệu production.</p></div>
        <div className="surface model-table-shell">{models.length ? <div className="table-scroll"><table className="pricing-table"><thead><tr><th>Model</th><th>Provider</th><th>Input / 1M</th><th>Output / 1M</th><th>Status</th></tr></thead><tbody>{models.map((model: any) => <tr key={model.id} id={model.id}><td><strong>{model.display_name}</strong><div className="price-sub">{model.id}</div></td><td>{providerName(model.id)}</td><td>{formatVndFromMicros(model.retail_input_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken)}</td><td>{formatVndFromMicros(model.retail_output_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken)}</td><td><span className={`status-chip ${model.status === 'active' ? 'success' : 'warning'}`}>{model.status === 'active' ? 'Online' : 'Degraded'}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>Catalog đang cập nhật</strong><p>Chưa có model public để hiển thị.</p></div>}</div>
      </section>
      <section className="landing-section"><div className="benefit-grid"><article><strong>OpenAI-compatible</strong><p>Giữ cách gọi quen thuộc và thay Base URL sang APIVN.</p></article><article><strong>Một Master API Key</strong><p>Mỗi tài khoản dùng một key duy nhất cho toàn bộ model.</p></article><article><strong>Thanh toán VNĐ</strong><p>Pricing hiển thị theo token và wallet được quản lý trong Developer Console.</p></article></div></section>
      <section className="landing-section"><div className="landing-cta"><div><h2>Chọn model rồi gửi request.</h2><p>Xem hướng dẫn tích hợp hoặc tạo tài khoản để lấy Master API Key.</p></div><div className="landing-hero-actions"><Link href="/docs" className="btn secondary">Xem Docs</Link><Link href="/signup" className="btn">Tạo tài khoản</Link></div></div></section>
    </main>
    <footer className="public-footer"><div className="public-footer-inner"><BrandLogo /><span>AI model API catalog · APIVN.tech</span></div></footer>
  </>
}
