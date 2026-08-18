import Link from 'next/link'

const models = [
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    price: '300đ / 1M token',
    approx: '~30đ cho 100k token',
    tag: 'Tiết kiệm • Chat nhanh',
    desc: 'Tốc độ nhanh, chi phí siêu rẻ, phù hợp dịch thuật và các tác vụ trò chuyện thường ngày.',
  },
  {
    id: 'deepseek-v4',
    name: 'DeepSeek V4',
    price: '800đ / 1M token',
    approx: '~80đ cho 100k token',
    tag: 'Code • Reasoning Rẻ',
    desc: 'Mô hình suy luận và hỗ trợ code với hiệu năng vượt trội và chi phí tối ưu.',
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    price: '2.500đ / 1M token',
    approx: '~250đ cho 100k token',
    tag: 'Lập trình • Phân tích sâu',
    desc: 'Khả năng viết code xuất sắc, phân tích logic ngữ cảnh dài và tạo sinh tài liệu chất lượng cao.',
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    price: '3.000đ / 1M token',
    approx: '~300đ cho 100k token',
    tag: 'Đa năng • Cân bằng',
    desc: 'Cân bằng lý tưởng giữa tốc độ phản hồi và độ thông minh trong xử lý văn bản.',
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    price: '3.500đ / 1M token',
    approx: '~350đ cho 100k token',
    tag: 'Sáng tạo • Viết lách',
    desc: 'Phiên bản chuyên biệt cho sáng tạo nội dung, lập kế hoạch và tác vụ phức tạp.',
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    price: '4.000đ / 1M token',
    approx: '~400đ cho 100k token',
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
              🚀 Nạp VNĐ • Tương thích chuẩn OpenAI API
            </span>
            <h1 style={{ fontSize: '38px', lineHeight: 1.2 }}>
              Một API duy nhất để khai thác mọi mô hình AI hàng đầu thế giới.
            </h1>
            <p className="muted" style={{ fontSize: '16px' }}>
              Không cần thẻ thanh toán quốc tế hay quy đổi credit phức tạp. Nạp tiền bằng VNĐ, dùng thử trực tiếp trên
              trình duyệt và tích hợp mượt mà vào ứng dụng chỉ với một dòng code.
            </p>
            <div className="row" style={{ justifyContent: 'flex-start', marginTop: '12px' }}>
              <Link className="btn" href="/signup" style={{ padding: '12px 24px', fontSize: '15px' }}>
                Dùng thử miễn phí →
              </Link>
              <a className="btn secondary" href="#pricing" style={{ padding: '12px 24px', fontSize: '15px' }}>
                Xem bảng giá VNĐ
              </a>
            </div>
          </div>

          <div className="card stack">
            <div className="row">
              <span className="badge">Khuyên dùng</span>
              <span className="muted">Mô hình phổ biến nhất</span>
            </div>
            <div>
              <h3>Claude Sonnet 5</h3>
              <p className="muted">Lựa chọn tối ưu cho lập trình và phân tích</p>
            </div>
            <div className="price">
              2.500đ <span className="muted" style={{ fontSize: '14px', fontWeight: 400 }}>/ 1 triệu token</span>
            </div>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '8px 0' }} />
            <div className="stack" style={{ gap: '10px', fontSize: '14px' }}>
              <div>✓ Chat thử nghiệm trực tiếp không cần API key</div>
              <div>✓ Format tương thích chuẩn <code>/v1/chat/completions</code></div>
              <div>✓ Đối soát chi tiết token và chi phí theo từng request</div>
              <div>✓ Đa hạ tầng dự phòng chống gián đoạn dịch vụ</div>
            </div>
          </div>
        </section>

        <section id="pricing" style={{ padding: '48px 0 80px' }}>
          <div className="stack" style={{ marginBottom: '32px' }}>
            <h2>Bảng giá niêm yết minh bạch</h2>
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
