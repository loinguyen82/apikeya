import Link from 'next/link'

const models = [
  { name: 'Kimi K2.6', price: '150đ / 1M', credit: '0,15 Credit', purpose: 'Code, chat dài, automation' },
  { name: 'DeepSeek V4', price: '300đ / 1M', credit: '0,3 Credit', purpose: 'Reasoning và code tiết kiệm' },
  { name: 'GPT-5.6 Luna', price: '600đ / 1M', credit: '0,6 Credit', purpose: 'Sáng tạo, coding và tác vụ thường ngày' },
  { name: 'Claude Sonnet 5', price: '750đ / 1M', credit: '0,75 Credit', purpose: 'Lập trình và phân tích sâu' },
  { name: 'GPT-5.6 Terra', price: '1.500đ / 1M', credit: '1,5 Credit', purpose: 'Đa năng, cân bằng' },
  { name: 'GPT-5.6 Sol', price: '2.500đ / 1M', credit: '2,5 Credit', purpose: 'Reasoning kỹ thuật khó' },
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
            <Link href="/login" className="btn secondary">Đăng nhập bằng key</Link>
            <Link href="/signup" className="btn">Bắt đầu</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="container hero-refresh">
          <div className="hero-copy">
            <div className="hero-eyebrow">API gateway cho developer Việt Nam</div>
            <h1>Một API cho nhiều model. Một key cho cả API và Dashboard.</h1>
            <p className="muted">
              Tạo tài khoản không cần xác minh email, nạp bằng VNĐ rồi nhận API key. Sau đó dùng Claude, GPT, Kimi và DeepSeek qua một Base URL và đăng nhập Dashboard bằng chính key đó.
            </p>

            <div className="hero-actions">
              <Link href="/signup" className="btn" style={{ padding: '12px 20px' }}>Bắt đầu từ 20.000đ</Link>
              <a href="#pricing" className="btn secondary" style={{ padding: '12px 20px' }}>Xem bảng giá</a>
            </div>

            <div className="hero-proof" aria-label="Điểm nổi bật">
              <span>Nạp từ 20.000đ</span>
              <span>0 Credit miễn phí</span>
              <span>Nạp xong mới mở key</span>
              <span>1 user · 1 key active</span>
            </div>
          </div>

          <div className="quickstart-card" aria-label="Quick start">
            <div className="quickstart-head">
              <strong>Quick start</strong>
              <span>OpenAI-compatible</span>
            </div>
            <div className="code-panel">{`export OPENAI_BASE_URL=https://70-36-125-65.sslip.io/v1\nexport OPENAI_API_KEY=sk-...\n\ncodex --model gpt-5.6-luna`}</div>
            <div className="gateway-status">
              <div>
                <strong>Key cũng là credential Dashboard</strong>
                <div className="muted" style={{ fontSize: '12px' }}>Rotate key không reset số dư hay quota</div>
              </div>
              <span className="badge">6 model đã cấu hình</span>
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
              <p className="muted" style={{ marginTop: '6px' }}>Flat total: tổng input + output token × đơn giá. 1 Credit = 1.000đ.</p>
            </div>
            <Link href="/docs" className="btn secondary">Xem cách tích hợp</Link>
          </div>

          <div className="pricing-shell">
            <table className="pricing-table">
              <thead><tr><th>Model</th><th>Phù hợp</th><th>Giá / 1M token</th><th></th></tr></thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.name}>
                    <td><div className="model-name"><span className="model-dot" /><strong>{model.name}</strong></div></td>
                    <td className="model-purpose">{model.purpose}</td>
                    <td><strong>{model.price}</strong><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{model.credit}</div></td>
                    <td style={{ textAlign: 'right' }}><Link href="/signup" style={{ color: 'var(--refresh-teal-hover)', fontWeight: 650 }}>Bắt đầu →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--refresh-line)', padding: '28px 0 38px', background: '#fff' }}>
        <div className="container row">
          <div className="landing-brand"><span className="brand-mark">A</span><span>Apikeya</span></div>
          <p className="muted" style={{ fontSize: '13px' }}>API gateway · thanh toán VNĐ · dành cho developer Việt Nam</p>
        </div>
      </footer>
    </>
  )
}
