import Link from 'next/link'

export default function DocsPage() {
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://ai-api-gateway.loi822004.workers.dev'
  return <main className="docs-shell">
    <header className="docs-top"><Link href="/" className="landing-brand"><span className="brand-mark">A</span><span>Apikeya</span></Link><div className="page-actions"><Link href="/dashboard/models" className="btn secondary">Model catalog</Link><Link href="/dashboard" className="btn">Dashboard</Link></div></header>

    <section className="docs-hero">
      <div className="docs-hero-copy"><div className="eyebrow">Developer docs</div><h1>Tích hợp bằng API chuẩn OpenAI.</h1><p className="muted">Tạo key, đổi Base URL và giữ nguyên workflow SDK hiện tại. Claude Code có cấu hình Anthropic riêng ở phần bên dưới.</p><div className="brand-row" style={{ marginTop: 20 }}><span className="brand-pill"><i />OpenAI</span><span className="brand-pill"><i />Anthropic</span><span className="brand-pill"><i />Kimi</span><span className="brand-pill"><i />DeepSeek</span></div></div>
      <pre className="docs-code"><span className="accent">from</span> openai <span className="accent">import</span> OpenAI{`\n\n`}client = OpenAI({`\n`}  api_key=<span className="accent">"sk-..."</span>,{`\n`}  base_url=<span className="accent">"${gatewayUrl}/v1"</span>{`\n`})</pre>
    </section>

    <div className="docs-grid">
      <nav className="surface docs-nav"><div className="eyebrow" style={{ marginBottom: 8 }}>Nội dung</div><a href="#quickstart">Quick start</a><a href="#openai">OpenAI SDK</a><a href="#node">Node.js</a><a href="#claude">Claude Code</a><a href="#curl">cURL</a></nav>
      <div className="docs-content">
        <section id="quickstart" className="surface docs-section"><div className="eyebrow">Quick start</div><h2>Ba bước để gửi request đầu tiên</h2><div className="quick-config"><div className="config-item"><small>1 · API key</small><strong>Tạo trong Dashboard</strong><p className="muted" style={{ marginTop: 5 }}>Secret chỉ hiện một lần.</p></div><div className="config-item"><small>2 · Base URL</small><code>{gatewayUrl}/v1</code></div></div><div className="config-item" style={{ marginTop: 12 }}><small>3 · Model</small><p className="muted">Chọn model ID từ <Link href="/dashboard/models"><strong>Model catalog</strong></Link> và truyền vào field <span className="inline-code">model</span>.</p></div></section>

        <section id="openai" className="surface docs-section"><h2>Python · OpenAI SDK</h2><pre className="docs-code">{`from openai import OpenAI\n\nclient = OpenAI(\n    api_key="sk-your_api_key_here",\n    base_url="${gatewayUrl}/v1"\n)\n\nresponse = client.chat.completions.create(\n    model="kimi-k2.6",\n    messages=[{"role": "user", "content": "Xin chào"}]\n)\nprint(response.choices[0].message.content)`}</pre></section>

        <section id="node" className="surface docs-section"><h2>Node.js / TypeScript</h2><pre className="docs-code">{`import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  apiKey: process.env.AI_API_KEY,\n  baseURL: '${gatewayUrl}/v1',\n});\n\nconst result = await client.chat.completions.create({\n  model: 'kimi-k2.6',\n  messages: [{ role: 'user', content: 'Xin chào' }],\n});`}</pre></section>

        <section id="claude" className="surface docs-section"><h2>Claude Code</h2><p>Claude Code dùng chuẩn Anthropic Messages. Base URL đặt ở domain gateway, không thêm <span className="inline-code">/v1</span> vì CLI tự nối endpoint.</p><pre className="docs-code">{`# PowerShell\n$env:ANTHROPIC_AUTH_TOKEN="sk-your_api_key_here"\n$env:ANTHROPIC_BASE_URL="${gatewayUrl}"\nclaude "Tóm tắt repo này"`}</pre></section>

        <section id="curl" className="surface docs-section"><h2>cURL</h2><pre className="docs-code">{`curl ${gatewayUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer sk-your_api_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"kimi-k2.6","messages":[{"role":"user","content":"Xin chào"}]}'`}</pre></section>
      </div>
    </div>
  </main>
}
