import Link from 'next/link'

const models = [
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    price: '0,3 🥕 / 1M token',
    approx: '~0,03 🥕 cho 100k token',
    tag: 'Code • Reasoning Rẻ',
    desc: 'Tốc độ nhanh, chi phí siêu rẻ, phù hợp dịch thuật và các tác vụ trò chuyện thường ngày.',
  },
  {
    id: 'deepseek-v4',
    name: 'DeepSeek V4',
    price: '0,8 🥕 / 1M token',
    approx: '~0,08 🥕 cho 100k token',
    tag: 'Code • Reasoning Rẻ',
    desc: 'Mô hình suy luận và hỗ trợ code với hiệu năng vượt trội và chi phí tối ưu.',
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    price: '2,5 🥕 / 1M token',
    approx: '~0,25 🥕 cho 100k token',
    tag: 'Lập trình • Phân tích sâu',
    desc: 'Khả năng viết code xuất sắc, phân tích logic ngữ cảnh dài và tạo sinh tài liệu chất lượng cao.',
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    price: '3 🥕 / 1M token',
    approx: '~0,3 🥕 cho 100k token',
    tag: 'Đa năng • Cân bằng',
    desc: 'Cân bằng lý tưởng giữa tốc độ phản hồi và độ thông minh trong xử lý văn bản.',
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    price: '3,5 🥕 / 1M token',
    approx: '~0,35 🥕 cho 100k token',
    tag: 'Sáng tạo • Viết lách',
    desc: 'Phiên bản chuyên biệt cho sáng tạo nội dung, lập kế hoạch và tác vụ phức tạp.',
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    price: '4 🥕 / 1M token',
    approx: '~0,4 🥕 cho 100k token',
    tag: 'Reasoning • Siêu cấp',
    desc: 'Mô hình suy luận mạnh mẽ nhất cho các bài toán khoa học, toán học và kỹ thuật khó.',
  },
]

export default function HomePage() {
  return (
    <>
      <header className="topbar">
        <div className="container row">
          <div className="brand">
            <span>⚡</span>
            <span>AI API</span>
          </div>
          <div className="row" style={{ gap: '12px' }}>
            <a href="#pricing" className="btn secondary" style={{ border: 'none' }}>
              Bảng giá
            </a>
            <Link href="/docs" className="btn secondary" style={{ border: 'none' }}>
              Tài liệu
            </Link>
            <Link href="/login" className="btn secondary">
              Đăng nhập
            </Link>
            <Link href="/signup" className="btn">
              Bắt đầu ngay
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="stack">
            <span className="badge" style={{ alignSelf: 'flex-start' }}>
              OPENAI-COMPATIBLE / CODE AGENT READY
            </span>
            <h1 style={{ fontSize: '38px', lineHeight: 1.2 }}>
              Một API key. Nhiều model mạnh. Chạy code agent cả ngày.
            </h1>
            <p className="muted" style={{ fontSize: '16px' }}>
              Một Base URL cho Claude, GPT, Kimi và DeepSeek. Nạp bằng VNĐ, theo dõi quota minh bạch, giữ nguyên workflow
              của Codex, Claude Code, Cursor và OpenAI SDK.
            </p>
            <div className="row" style={{ justifyContent: 'flex-start', marginTop: '12px' }}>
              <Link className="btn" href="/signup" style={{ padding: '12px 24px', fontSize: '15px' }}>
                Trải nghiệm Playground →
              </Link>
              <a className="btn secondary" href="#pricing" style={{ padding: '12px 24px', fontSize: '15px' }}>
                Xem bảng giá 🥕
              </a>
            </div>
          </div>

          <div className="terminal">
            <div className="terminal-bar"><span /><span /><span /></div>
            <code><span className="prompt">$</span> export OPENAI_BASE_URL=https://ai-api-gateway.loi822004.workers.dev/v1{`\n`}<span className="prompt">$</span> codex --model gpt-5.6-luna{`\n`}<span style={{ color: 'var(--primary-hover)' }}>✓ gateway connected · quota tracked · 6 models ready</span></code>
          </div>
        </section>

        <section className="card" style={{ marginBottom: '48px' }}>
          <div className="row" style={{ marginBottom: '20px' }}>
            <div>
              <span className="badge">BẮT ĐẦU TRONG 3 BƯỚC</span>
              <h2 style={{ marginTop: '10px' }}>Từ key đến request đầu tiên.</h2>
            </div>
            <Link href="/docs" className="muted">Xem tài liệu →</Link>
          </div>
          <div className="flow-steps">
            <div className="flow-step"><strong>01 · Tạo API key</strong><span className="muted">Tạo một key duy nhất trong dashboard và theo dõi quota theo request.</span></div>
            <div className="flow-step"><strong>02 · Đổi Base URL</strong><span className="muted">Giữ nguyên SDK hoặc code agent, chỉ đổi endpoint sang gateway của bạn.</span></div>
            <div className="flow-step"><strong>03 · Chọn model</strong><span className="muted">Chọn model theo việc cần làm: code, chat dài, reasoning hoặc automation.</span></div>
          </div>
        </section>

        <section id="pricing" style={{ padding: '48px 0 80px' }}>
          <div className="stack" style={{ marginBottom: '32px' }}>
            <h2>🥕 Bảng giá niêm yết minh bạch</h2>
            <p className="muted">
              Được tính toán theo lượng token sử dụng thực tế. 1 triệu token tương đương khoảng 750.000 từ tiếng Việt.
            </p>
          </div>

          <div className="grid">
            {models.map((m) => (
              <div className="card stack" key={m.id} style={{ justifyContent: 'space-between' }}>
                <div className="stack" style={{ gap: '12px' }}>
                  <span className="badge" style={{ alignSelf: 'flex-start' }}>
                    {m.tag}
                  </span>
                  <h3>{m.name}</h3>
                  <div className="price">{m.price}</div>
                  <div className="muted" style={{ fontSize: '13px', color: 'var(--success)' }}>
                    {m.approx}
                  </div>
                  <p className="muted" style={{ fontSize: '14px' }}>
                    {m.desc}
                  </p>
                </div>
                <div style={{ marginTop: '20px' }}>
                  <Link href="/signup" className="btn" style={{ width: '100%' }}>
                    Dùng thử mô hình này
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--line)', padding: '32px 0', marginTop: '64px' }}>
        <div className="container row">
          <div className="brand">
            <span>⚡</span>
            <span>AI API</span>
          </div>
          <p className="muted" style={{ fontSize: '13px' }}>
            © 2026 AI API Reseller Gateway. Toàn quyền bảo lưu.
          </p>
        </div>
      </footer>
    </>
  )
}
