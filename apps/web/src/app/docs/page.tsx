import Link from 'next/link'

export default function DocsPage() {
  return (
    <main className="container" style={{ maxWidth: 840, padding: '48px 20px 80px' }}>
      <div className="stack" style={{ gap: '28px' }}>
        <div className="row">
          <Link href="/" className="brand">
            <span>⚡</span>
            <span>AI API</span>
          </Link>
          <Link href="/dashboard" className="btn secondary">
            Vào Dashboard →
          </Link>
        </div>

        <div className="stack" style={{ gap: '8px' }}>
          <h1>Tài Liệu Tích Hợp API</h1>
          <p className="muted">
            Gateway hoàn toàn tương thích với định dạng chuẩn của OpenAI API. Bạn chỉ cần thay đổi <code>baseURL</code> và truyền <code>API Key</code> đã tạo từ hệ thống.
          </p>
        </div>

        <div className="card stack">
          <h3>1. Điểm Cuối (Endpoints)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Mô tả</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>GET</code></td>
                <td><code>/v1/models</code></td>
                <td>Lấy danh sách các model AI đang hoạt động</td>
              </tr>
              <tr>
                <td><code>POST</code></td>
                <td><code>/v1/chat/completions</code></td>
                <td>Gọi tạo phản hồi Chat Completion (hỗ trợ cả JSON & Streaming SSE)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card stack">
          <h3>2. Ví Dụ Gọi cURL</h3>
          <pre
            style={{
              padding: '16px',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-sm)',
              overflowX: 'auto',
              fontSize: '13px',
              border: '1px solid var(--line)',
            }}
          >
{`curl https://api.yourdomain.vn/v1/chat/completions \\
  -H "Authorization: Bearer ak_live_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: req_unique_id_123" \\
  -d '{
    "model": "claude-sonnet-5",
    "messages": [
      { "role": "system", "content": "Bạn là trợ lý AI chuyên nghiệp." },
      { "role": "user", "content": "Viết đoạn code Python tính số Fibonacci." }
    ],
    "temperature": 0.7,
    "max_tokens": 1024
  }'`}
          </pre>
        </div>

        <div className="card stack">
          <h3>3. Tích Hợp Với Thư Viện OpenAI (Node.js / Python)</h3>
          <div className="stack" style={{ gap: '12px' }}>
            <p className="muted"><strong>Node.js / TypeScript:</strong></p>
            <pre
              style={{
                padding: '14px',
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                overflowX: 'auto',
                fontSize: '13px',
                border: '1px solid var(--line)',
              }}
            >
{`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.AI_API_KEY, // ak_live_...
  baseURL: 'https://api.yourdomain.vn/v1',
});

const response = await client.chat.completions.create({
  model: 'claude-sonnet-5',
  messages: [{ role: 'user', content: 'Xin chào AI!' }],
});

console.log(response.choices[0].message.content);`}
            </pre>

            <p className="muted" style={{ marginTop: '8px' }}><strong>Python:</strong></p>
            <pre
              style={{
                padding: '14px',
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                overflowX: 'auto',
                fontSize: '13px',
                border: '1px solid var(--line)',
              }}
            >
{`from openai import OpenAI

client = OpenAI(
    api_key="ak_live_your_api_key_here",
    base_url="https://api.yourdomain.vn/v1"
)

response = client.chat.completions.create(
    model="claude-sonnet-5",
    messages=[{"role": "user", "content": "Xin chào AI!"}]
)

print(response.choices[0].message.content)`}
            </pre>
          </div>
        </div>
      </div>
    </main>
  )
}
