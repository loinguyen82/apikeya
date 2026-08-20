import Link from 'next/link'

const models = [
  { name: 'Kimi K2.6', price: '0,3 cr / 1M', purpose: 'Code, chat dài, automation' },
  { name: 'DeepSeek V4', price: '0,8 cr / 1M', purpose: 'Reasoning và code tiết kiệm' },
  { name: 'Claude Sonnet 5', price: '2,5 cr / 1M', purpose: 'Lập trình và phân tích sâu' },
  { name: 'GPT-5.6 Terra', price: '3 cr / 1M', purpose: 'Đa năng, cân bằng' },
  { name: 'GPT-5.6 Luna', price: '3,5 cr / 1M', purpose: 'Sáng tạo và lập kế hoạch' },
  { name: 'GPT-5.6 Sol', price: '4 cr / 1M', purpose: 'Reasoning kỹ thuật khó' },
]

const providers = [
  ['OpenAI', 'GPT'],
  ['Anthropic', 'Claude'],
  ['Kimi', 'Moonshot'],
  ['DeepSeek', 'DeepSeek'],
]

export default function HomePage() {
  return (
    <>
      <header className="topbar">
        <div className="container row">
          <Link href="/" className="landing-brand" aria-label="Apikeya home">
            <span className="brand-mark">A</span>
            <span>Apikeya</span>
          </Link>

          <div className="row" style={{ gap: '10px' }}>
            <a href="#pricing" className="btn secondary" style={{ border: 'none' }}>Bảng giá</a>
            <Link href="/docs" className="btn secondary" style={{ border: 'none' }}>Tài liệu</Link>
            <Link href="/login" className="btn secondary">Đăng nhập</Link>
            <Link href="/signup" className="btn">Bắt đầu</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="container hero-refresh">
          <div className="hero-copy">
            <div className="hero-eyebrow">API gateway cho developer Việt Nam</div>
            <h1>Một API cho nhiều model. Thanh toán bằng VNĐ.</h1>
            <p className="muted">
              Dùng Claude, GPT, Kimi và DeepSeek qua một Base URL. Giữ nguyên SDK và workflow hiện tại,
              đồng thời theo dõi request, quota và chi phí trong một console duy nhất.
            </p>

            <div className="hero-actions">
              <Link href="/signup" className="btn" style={{ padding: '12px 20px' }}>Mở Playground</Link>
              <a href="#pricing" className="btn secondary" style={{ padding: '12px 20px' }}>Xem bảng giá</a>
            </div>

            <div className="hero-proof" aria-label="Điểm nổi bật">
              <span>1 API key</span>
              <span>Thanh toán VNĐ</span>
              <span>Chi phí theo request</span>
              <span>OpenAI-compatible</span>
            </div>
          </div>

          <div className="quickstart-card" aria-label="Quick start">
            <div className="quickstart-head">
              <strong>Quick start</strong>
              <span>OpenAI-compatible</span>
            </div>
            <div className="code-panel">{`export OPENAI_BASE_URL=https://ai-api-gateway.loi822004.workers.dev/v1\nexport OPENAI_API_KEY=apikeya_...\n\ncodex --model gpt-5.6-luna`}</div>
            <div className="gateway-status">
              <div>
                <strong>Gateway connected</strong>
                <div className="muted" style={{ fontSize: '12px' }}>Quota được theo dõi theo từng request</div>
              </div>
              <span className="badge">6 model sẵn sàng</span>
            </div>
          </div>
        </section>

        <section className="container provider-strip" aria-label="Nhà cung cấp hỗ trợ">
          {providers.map(([name, family]) => (
            <div className="provider-chip" key={name}>
              <strong>{name}</strong>
              <span>{family}</span>
            </div>
          ))}
        </section>

        <section id="pricing" className="container" style={{ padding: '34px 20px 88px' }}>
          <div className="section-heading">
            <div>
              <h2 style={{ fontSize: '28px', letterSpacing: '-0.03em' }}>Bảng giá model</h2>
              <p className="muted" style={{ marginTop: '6px' }}>Giá niêm yết để so sánh nhanh, tính theo lượng token sử dụng thực tế.</p>
            </div>
            <Link href="/docs" className="btn secondary">Xem cách tích hợp</Link>
          </div>

          <div className="pricing-shell">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Phù hợp</th>
                  <th>Giá</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.name}>
                    <td>
                      <div className="model-name">
                        <span className="model-dot" />
                        <strong>{model.name}</strong>
                      </div>
                    </td>
                    <td className="model-purpose">{model.purpose}</td>
                    <td><strong>{model.price}</strong></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link href="/signup" style={{ color: 'var(--refresh-teal-hover)', fontWeight: 650 }}>Dùng model →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--refresh-line)', padding: '28px 0 38px', background: '#fff' }}>
        <div className="container row">
          <div className="landing-brand">
            <span className="brand-mark">A</span>
            <span>Apikeya</span>
          </div>
          <p className="muted" style={{ fontSize: '13px' }}>API gateway · VNĐ-first · dành cho developer Việt Nam</p>
        </div>
      </footer>
    </>
  )
}
