import Link from 'next/link'
import { BrandLogo } from '@/components/BrandLogo'
import { CopyButton } from '@/components/CopyButton'
import { createServerSupabase } from '@/lib/supabase/server'
import { formatVndFromMicros } from '@/lib/money'

function providerName(id: string) {
  if (id.includes('claude')) return 'Anthropic'
  if (id.includes('kimi')) return 'Moonshot'
  if (id.includes('deepseek')) return 'DeepSeek'
  if (id.includes('gemini')) return 'Google'
  if (id.includes('gpt')) return 'OpenAI'
  return 'APIVN route'
}

function curlExample(baseUrl: string, model: string) {
  return [`curl ${baseUrl}/chat/completions \\`, '  -H "Authorization: Bearer $APIVN_API_KEY" \\', '  -H "Content-Type: application/json" \\', `  -d '{"model":"${model}","messages":[{"role":"user","content":"Xin chào"}]}'`].join('\n')
}

export default async function HomePage() {
  const gatewayUrl = (process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech').replace(/\/+$/, '')
  const baseUrl = `${gatewayUrl}/v1`
  const supabase = await createServerSupabase()
  const { data: models } = await supabase.from('models').select('id,display_name,status,pricing_mode,retail_flat_micros_per_mtoken,retail_input_micros_per_mtoken,retail_output_micros_per_mtoken').neq('status', 'disabled').order('retail_flat_micros_per_mtoken', { ascending: true }).limit(8)
  const liveModels = models ?? []
  const sampleModel = liveModels[0]?.id ?? 'model-id'
  const example = curlExample(baseUrl, sampleModel)
  return <>
    <header className="public-header"><div className="public-header-inner"><BrandLogo /><nav className="public-nav" aria-label="Điều hướng chính"><a href="#models">Models</a><a href="#pricing">Pricing</a><a href="#quick-api">API example</a><a href="#faq">FAQ</a><Link href="/docs">Docs</Link></nav><div className="public-actions"><Link href="/login" className="btn secondary">Đăng nhập</Link><Link href="/signup" className="btn">Bắt đầu</Link></div></div></header>
    <main className="landing-main">
      <section className="landing-hero"><div className="landing-hero-copy"><div className="eyebrow">OpenAI-compatible AI gateway</div><h1>Một API.<br /><span>Nhiều model AI.</span></h1><p>Dùng Claude, GPT, Kimi và DeepSeek qua một Base URL. Thanh toán bằng VNĐ, quản lý key và usage trong Developer Console gọn nhẹ.</p><div className="landing-hero-actions"><Link href="/signup" className="btn">Bắt đầu →</Link><a href="#pricing" className="btn secondary">Xem bảng giá</a></div><div className="landing-trust"><span>Một Base URL</span><span>Nhiều model</span><span>Thanh toán VNĐ</span><span>OpenAI compatible</span></div></div><div className="hero-console" aria-label="Ví dụ gọi API"><div className="hero-console-bar"><span className="hero-console-dots"><i /><i /><i /></span><span>request.sh</span><span>cURL</span></div><pre className="hero-console-code"><code>{example}</code></pre><div className="endpoint-strip"><code>{baseUrl}</code><CopyButton value={baseUrl} compact /></div></div></section>
      <section id="models" className="landing-section"><div className="section-intro"><div className="eyebrow">Models</div><h2>Đổi model, không đổi cách tích hợp.</h2><p>Catalog dưới đây lấy trực tiếp từ database production, không phải mock data trên client.</p></div>{liveModels.length ? <div className="public-models">{liveModels.map((model: any) => <div className="public-model-row" key={model.id}><strong>{model.display_name}</strong><code>{model.id}</code><span>{providerName(model.id)}</span><span className={`status-chip ${model.status === 'active' ? 'success' : 'warning'}`}>{model.status === 'active' ? 'Online' : 'Degraded'}</span></div>)}</div> : <div className="empty-state"><strong>Catalog đang được cập nhật</strong><p>Không có model khả dụng để hiển thị lúc này.</p></div>}</section>
      <section id="pricing" className="landing-section"><div className="section-intro"><div className="eyebrow">Pricing</div><h2>Giá minh bạch theo token.</h2><p>Nạp VNĐ vào wallet, các API Key trong account cùng dùng một số dư.</p></div><div className="surface model-table-shell">{liveModels.length ? <div className="table-scroll"><table className="pricing-table"><thead><tr><th>Model</th><th>Input / 1M</th><th>Output / 1M</th><th>Status</th></tr></thead><tbody>{liveModels.map((model: any) => <tr key={model.id}><td><strong>{model.display_name}</strong><div className="price-sub">{model.id}</div></td><td>{formatVndFromMicros(model.retail_input_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken)}</td><td>{formatVndFromMicros(model.retail_output_micros_per_mtoken ?? model.retail_flat_micros_per_mtoken)}</td><td><span className={`status-chip ${model.status === 'active' ? 'success' : 'warning'}`}>{model.status === 'active' ? 'Online' : 'Degraded'}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>Chưa có dữ liệu pricing</strong><p>Pricing sẽ xuất hiện khi model catalog khả dụng.</p></div>}</div></section>
      <section id="quick-api" className="landing-section landing-api-section"><div className="section-intro"><div className="eyebrow">Quick API example</div><h2>Copy Base URL và gọi API.</h2><p>Authorization chuẩn Bearer; không có cơ chế xác thực riêng lạ.</p></div><div className="hero-console"><div className="hero-console-bar"><span>chat/completions</span><CopyButton value={example} compact /></div><pre className="hero-console-code"><code>{example}</code></pre></div></section>
      <section className="landing-section"><div className="benefit-grid"><article><strong>Developer-first</strong><p>Đăng nhập, tạo key, copy Base URL và test model trong vài phút.</p></article><article><strong>Account-centric</strong><p>Account sở hữu wallet, keys và usage. API Key không phải session token.</p></article><article><strong>Predictable</strong><p>Error format thống nhất, pricing hiển thị rõ và không fake payment success.</p></article></div></section>
      <section id="faq" className="landing-section"><div className="section-intro"><div className="eyebrow">FAQ</div><h2>Câu hỏi thường gặp.</h2></div><div className="faq-list"><details><summary>APIVN có dùng được với OpenAI SDK không?</summary><p>Có. Đặt API Key trong biến môi trường và đổi <code>baseURL</code> thành <code>{baseUrl}</code>.</p></details><details><summary>Các API Key có wallet riêng không?</summary><p>Không. Wallet thuộc account; mọi API Key active trong account dùng chung số dư.</p></details><details><summary>Có xem lại full secret được không?</summary><p>Không. Secret chỉ hiện một lần khi tạo hoặc rotate. Database chỉ lưu hash, prefix và bốn ký tự cuối.</p></details></div></section>
      <section className="landing-section"><div className="landing-cta"><div><h2>Sẵn sàng gửi request đầu tiên?</h2><p>Tạo account miễn phí. Không cần nạp tiền trước khi xem Dashboard.</p></div><Link href="/signup" className="btn">Mở Developer Console</Link></div></section>
    </main>
    <footer className="public-footer"><div className="public-footer-inner"><BrandLogo /><span>OpenAI-compatible AI gateway · APIVN.tech</span></div></footer>
  </>
}
