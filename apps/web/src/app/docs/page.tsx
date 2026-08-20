import Link from 'next/link'

export default function DocsPage() {
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://ai-api-gateway.loi822004.workers.dev'

  return (
    <main className="container" style={{ maxWidth: 880, padding: '48px 20px 80px' }}>
      <div className="stack" style={{ gap: '28px' }}>
        <div className="row">
          <Link href="/" className="brand">
            <span>⚡</span>
            <span>AI API Reseller</span>
          </Link>
          <Link href="/dashboard" className="btn secondary">
            Vào Dashboard →
          </Link>
        </div>

        <div className="stack" style={{ gap: '8px' }}>
          <span className="badge" style={{ alignSelf: 'flex-start' }}>DEVELOPER DOCS / OPENAI-COMPATIBLE</span>
          <h1>Một Base URL cho mọi workflow.</h1>
          <p className="muted">
            Dùng cùng một API key trong Codex CLI, Claude Code, Cursor, Cline, Python, Node.js và bất kỳ client OpenAI-compatible nào.
          </p>
        </div>

        <div className="card stack">
          <div className="row">
            <div>
              <span className="badge">BẮT ĐẦU TRONG 3 BƯỚC</span>
              <h3 style={{ marginTop: '10px' }}>Key → Base URL → model</h3>
            </div>
            <Link href="/dashboard/api-keys" className="btn">Tạo API key →</Link>
          </div>
          <div className="flow-steps">
            <div className="flow-step"><strong>01 · Lấy key</strong><span className="muted">Tạo key trong dashboard. Key chỉ hiển thị một lần.</span></div>
            <div className="flow-step"><strong>02 · Đổi endpoint</strong><span className="muted">Dùng Base URL <code>{gatewayUrl}/v1</code>.</span></div>
            <div className="flow-step"><strong>03 · Chọn model</strong><span className="muted">Giữ nguyên SDK, đổi field <code>model</code> theo catalog.</span></div>
          </div>
        </div>

        {/* THÔNG SỐ KẾT NỐI CHÍNH */}
        <div
          className="card stack"
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.05) 100%)',
            border: '1px solid var(--primary)',
            gap: '12px',
          }}
        >
          <h3>Thông số kết nối chính (Endpoint & Auth)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            <div>
              <span className="muted" style={{ fontSize: '12px' }}>Base URL:</span>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary-hover)', fontFamily: 'var(--font-mono)' }}>
                {gatewayUrl}/v1
              </div>
            </div>
            <div>
              <span className="muted" style={{ fontSize: '12px' }}>Định dạng API Key:</span>
              <div style={{ fontWeight: 700, fontSize: '15px', fontFamily: 'var(--font-mono)' }}>
                sk-xxxxxxxxxxxxxxxxxxxxxxxx
              </div>
            </div>
          </div>
        </div>

        {/* 1. DANH SÁCH MÃ MODEL */}
        <div className="card stack">
          <h3>1. Danh Sách Model ID Chuẩn</h3>
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Model ID</th>
                <th>Tên mô hình</th>
                <th>Giá bán lẻ (🥕 / 1M Token)</th>
                <th>Đặc điểm chính</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>kimi-k2.6</code></td>
                <td>Kimi K2.6</td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>0,3 🥕</td>
                <td>Siêu rẻ, đọc tài liệu dài 200k context</td>
              </tr>
              <tr>
                <td><code>deepseek-v4</code></td>
                <td>DeepSeek V4</td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>0,8 🥕</td>
                <td>Mã nguồn thông minh, toán học & coding</td>
              </tr>
              <tr>
                <td><code>claude-sonnet-5</code></td>
                <td>Claude Sonnet 5</td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>2,5 🥕</td>
                <td>Viết lách, suy luận phức tạp, code đỉnh cao</td>
              </tr>
              <tr>
                <td><code>gpt-5.6-terra</code></td>
                <td>GPT-5.6 Terra</td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>3 🥕</td>
                <td>Bản cân bằng tốc độ & chất lượng</td>
              </tr>
              <tr>
                <td><code>gpt-5.6-luna</code></td>
                <td>GPT-5.6 Luna</td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>3,5 🥕</td>
                <td>Tối ưu xử lý đa tác vụ nâng cao</td>
              </tr>
              <tr>
                <td><code>gpt-5.6-sol</code></td>
                <td>GPT-5.6 Sol</td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>4 🥕</td>
                <td>Flagship mạnh mẽ nhất thế hệ 5.6</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        {/* 2. CẤU HÌNH CURSOR IDE & VS CODE */}
        <div className="card stack">
          <h3>2. Tích Hợp Vào Cursor IDE / VS Code Continue</h3>
          <div className="stack" style={{ gap: '10px', fontSize: '14px', color: 'var(--text-muted)' }}>
            <p>1. Mở <strong>Cursor Settings</strong> → chọn mục <strong>Models</strong> → <strong>OpenAI API Key</strong>.</p>
            <p>2. Điền <strong>API Key:</strong> Khóa <code>sk-...</code> tạo từ mục <Link href="/dashboard/api-keys" style={{ color: 'var(--primary)' }}>Quản lý API Key</Link>.</p>
            <p>3. Bật <strong>Override OpenAI Base URL</strong> và điền: <code style={{ color: 'var(--primary-hover)', fontWeight: 600 }}>{gatewayUrl}/v1</code></p>
            <p>4. Bấm <strong>Add Model</strong> và nhập tên model bạn muốn dùng (ví dụ: <code>claude-sonnet-5</code>, <code>deepseek-v4</code>, <code>gpt-5.6-sol</code>).</p>
          </div>
        </div>

        {/* 3. CODE MẪU PYTHON */}
        <div className="card stack">
          <h3>3. Code Mẫu Python (OpenAI SDK & Streaming)</h3>
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
{`from openai import OpenAI

client = OpenAI(
    api_key="sk-your_api_key_here",
    base_url="${gatewayUrl}/v1"
)

# 1. Chat Completion Thông Thường
response = client.chat.completions.create(
    model="claude-sonnet-5",
    messages=[
        {"role": "system", "content": "Bạn là chuyên gia lập trình."},
        {"role": "user", "content": "Viết hàm Python kiểm tra số nguyên tố."}
    ],
    temperature=0.7
)
print(response.choices[0].message.content)

# 2. Chat Streaming (Phản Hồi Trực Tiếp Từng Từ)
stream = client.chat.completions.create(
    model="deepseek-v4",
    messages=[{"role": "user", "content": "Giải thích Machine Learning trong 3 câu."}],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`}
          </pre>
        </div>

        {/* 4. CODE MẪU NODE.JS / TYPESCRIPT */}
        <div className="card stack">
          <h3>4. Code Mẫu Node.js / TypeScript</h3>
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
{`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.AI_API_KEY, // sk-...
  baseURL: '${gatewayUrl}/v1',
});

async function main() {
  const stream = await client.chat.completions.create({
    model: 'gpt-5.6-sol',
    messages: [{ role: 'user', content: 'Hãy tạo dàn ý bài luận về tương lai AI.' }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main();`}
          </pre>
        </div>

        <div className="card stack">
          <h3>5. Claude Code (Anthropic Messages)</h3>
          <p className="muted">
            Claude Code dùng chuẩn Anthropic Messages. Với Claude Code, Base URL đặt ở domain gateway, không thêm <code>/v1</code> vì CLI tự nối <code>/v1/messages</code>.
          </p>
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
{`# PowerShell
$env:ANTHROPIC_AUTH_TOKEN="sk-your_api_key_here"
$env:ANTHROPIC_BASE_URL="${gatewayUrl}"
claude "Tóm tắt repo này trong 3 gạch đầu dòng"`}
          </pre>
        </div>

        {/* 6. GỌI cURL TRỰC TIẾP */}
        <div className="card stack">
          <h3>6. Lệnh cURL Trực Tiếp (Terminal / Postman)</h3>
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
{`curl ${gatewayUrl}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kimi-k2.6",
    "messages": [
      { "role": "user", "content": "Xin chào! 1 + 1 bằng mấy?" }
    ]
  }'`}
          </pre>
        </div>
      </div>
    </main>
  )
}
