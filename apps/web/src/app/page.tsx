import Link from 'next/link'
import { BrandLogo } from '@/components/BrandLogo'
import { CopyButton } from '@/components/CopyButton'

const models = [
  { name: 'Claude Sonnet', provider: 'Anthropic', purpose: 'Code và phân tích sâu' },
  { name: 'GPT', provider: 'OpenAI', purpose: 'Reasoning và tác vụ đa năng' },
  { name: 'Kimi', provider: 'Moonshot', purpose: 'Ngữ cảnh dài và automation' },
  { name: 'DeepSeek', provider: 'DeepSeek', purpose: 'Code và reasoning tiết kiệm' },
]

function buildCurlExample(gatewayUrl: string) {
  return `curl ${gatewayUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.6-luna",
    "messages": [{"role":"user","content":"Xin chào"}]
  }'`
}

export default function HomePage() {
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech'
  const curlExample = buildCurlExample(gatewayUrl)
  return (
    <>
      <header className="public-header">
        <div className="public-header-inner">
          <BrandLogo />
          <nav className="public-nav" aria-label="Điều hướng chính">
            <a href="#flow">Cách hoạt động</a>
            <a href="#models">Models</a>
            <a href="#billing">Thanh toán</a>
            <Link href="/docs">Tài liệu</Link>
          </nav>
          <div className="public-actions">
            <Link href="/login" className="btn secondary">Đăng nhập</Link>
            <Link href="/signup" className="btn">Bắt đầu</Link>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1>Một API key.<br /><span>Mọi model bạn cần.</span></h1>
            <p>
              Giữ nguyên SDK quen thuộc, đổi một Base URL và dùng Claude, GPT, Kimi hoặc DeepSeek ngay trong cùng một developer console.
            </p>
            <div className="landing-hero-actions">
              <Link href="/signup" className="btn">Tạo tài khoản miễn phí →</Link>
              <Link href="/docs" className="btn secondary">Xem tài liệu</Link>
            </div>
            <div className="landing-trust" aria-label="Điểm nổi bật">
              <span>Một key cho mọi model</span>
              <span>OpenAI-compatible</span>
              <span>Logs và chi phí rõ ràng</span>
            </div>
          </div>

          <div className="hero-console" aria-label="Ví dụ gọi API">
            <div className="hero-console-bar">
              <span className="hero-console-dots"><i /><i /><i /></span>
              <span>request.sh</span>
              <span>cURL</span>
            </div>
            <pre className="hero-console-code"><code>{curlExample}</code></pre>
            <div className="endpoint-strip">
              <code>{gatewayUrl}/v1</code>
              <CopyButton value={`${gatewayUrl}/v1`} compact />
            </div>
          </div>
        </section>

        <section id="flow" className="landing-section">
          <div className="section-intro">
            <h2>Từ đăng ký đến request đầu tiên theo một flow rõ ràng.</h2>
            <p>Account, billing, API key, model, cấu hình và usage nối liền trong cùng một developer journey.</p>
          </div>
          <div className="flow-rail">
            <article className="flow-step"><small>01 / ACCOUNT</small><h3>Tạo tài khoản</h3><p>Đăng ký để mở console và quản lý toàn bộ workflow.</p></article>
            <article className="flow-step"><small>02 / BILLING</small><h3>Nạp số dư</h3><p>Hiện là checkout mô phỏng; PayOS sẽ được nối vào đúng bước này.</p></article>
            <article className="flow-step"><small>03 / API KEY</small><h3>Tạo key & cấu hình</h3><p>Secret chỉ hiện một lần, config được sinh sẵn theo công cụ.</p></article>
            <article className="flow-step"><small>04 / REQUEST</small><h3>Gọi API & xem logs</h3><p>Test model, gửi request thật và theo dõi token cùng chi phí.</p></article>
          </div>
        </section>

        <section id="models" className="landing-section">
          <div className="section-intro">
            <h2>Một endpoint, nhiều dòng model.</h2>
            <p>Danh sách trong console lấy từ gateway thực tế; trạng thái và giá luôn được hiển thị tại nơi bạn sử dụng.</p>
          </div>
          <div className="public-models">
            {models.map((model) => (
              <div className="public-model-row" key={model.name}>
                <strong>{model.name}</strong>
                <span>{model.purpose}</span>
                <span>{model.provider}</span>
                <span className="model-compat">API compatible</span>
              </div>
            ))}
          </div>
        </section>

        <section id="billing" className="landing-section">
          <div className="landing-cta">
            <div>
              <h2>Dùng bao nhiêu, trả bấy nhiêu.</h2>
              <p>Nạp tiền đang ở chế độ mô phỏng trong lúc kết nối PayOS. Demo không cộng số dư thật.</p>
            </div>
            <Link href="/signup" className="btn">Mở developer console</Link>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <BrandLogo />
          <span>API gateway dành cho developer Việt Nam · APIVN.tech</span>
        </div>
      </footer>
    </>
  )
}
