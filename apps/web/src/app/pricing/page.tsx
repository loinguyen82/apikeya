import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandLogo } from '@/components/BrandLogo'
import { createServerSupabase } from '@/lib/supabase/server'
import { formatVndFromMicros } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Bảng giá API AI theo 1M token',
  description: 'Bảng giá API AI APIVN theo 1M token cho Claude, GPT, Kimi, DeepSeek và nhiều model khác. Thanh toán bằng VNĐ, một Master API Key.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Bảng giá API AI | APIVN.tech',
    description: 'So sánh giá API AI theo 1M token và trạng thái model trên APIVN.tech.',
    url: '/pricing',
  },
}

export default async function PricingPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('models')
    .select('id,display_name,status,retail_flat_micros_per_mtoken,retail_input_micros_per_mtoken,retail_output_micros_per_mtoken')
    .neq('status', 'disabled')
    .order('retail_flat_micros_per_mtoken', { ascending: true })

  const models = data ?? []

  return <>
    <header className="public-header"><div className="public-header-inner"><BrandLogo /><nav className="public-nav" aria-label="Điều hướng chính"><Link href="/models">Models</Link><Link href="/pricing">Pricing</Link><Link href="/status">Status</Link><Link href="/docs">Docs</Link></nav><div className="public-actions"><Link href="/login" className="btn secondary">Đăng nhập</Link><Link href="/signup" className="btn">Bắt đầu</Link></div></div></header>
    <main className="landing-main">
      <section className="landing-section">
        <div className="section-intro"><div className="eyebrow">API pricing</div><h1>Bảng giá API AI theo 1M token.</h1><p>Giá hiển thị bằng VNĐ và lấy trực tiếp từ catalog production. Mỗi tài khoản dùng một Master API Key và một wallet chung.</p></div>
        <div className="surface model-table-shell">{models.length ? <div className="table-scroll"><table className="pricing-table"><thead><tr><th>Model</th><th>Input / 1M</th><th>Output / 1M</th><th>Status</th></tr></thead><tbody>{models.map((model: any) => <tr key={model.id}><td><strong>{model.display_name}</strong><div className="price-sub">{model.id}</div></td><td>{formatVndFromMicros(model.retail_input_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken)}</td><td>{formatVndFromMicros(model.retail_output_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken)}</td><td><span className={`status-chip ${model.status === 'active' ? 'success' : 'warning'}`}>{model.status === 'active' ? 'Online' : 'Degraded'}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>Pricing đang cập nhật</strong><p>Chưa có model public để hiển thị.</p></div>}</div>
      </section>
      <section className="landing-section"><div className="benefit-grid"><article><strong>1 Credit = 1.000đ</strong><p>Nạp VNĐ và quy đổi thành Credit để theo dõi chi phí dễ hơn.</p></article><article><strong>Không khóa theo gói</strong><p>Chi phí request phụ thuộc model và số token thực tế.</p></article><article><strong>Minh bạch / 1M token</strong><p>So sánh input và output rate trước khi tích hợp.</p></article></div></section>
      <section className="landing-section"><div className="landing-cta"><div><h2>Cần xem model nào đang hoạt động?</h2><p>Mở trang Status để xem kết quả health check gần nhất.</p></div><div className="landing-hero-actions"><Link href="/status" className="btn secondary">Model Status</Link><Link href="/signup" className="btn">Lấy API Key</Link></div></div></section>
    </main>
    <footer className="public-footer"><div className="public-footer-inner"><BrandLogo /><span>API AI pricing bằng VNĐ · APIVN.tech</span></div></footer>
  </>
}
