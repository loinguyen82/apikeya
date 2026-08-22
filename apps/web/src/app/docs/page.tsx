import Link from 'next/link'
import { BrandLogo } from '@/components/BrandLogo'

export default function DocsPage() {
  const gatewayUrl = (process.env.NEXT_PUBLIC_GATEWAY_BASE_URL || 'https://api.apivn.tech').replace(/\/+$/, '')
  const baseUrl = `${gatewayUrl}/v1`
  const pythonExample = `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["APIVN_API_KEY"],
    base_url="${baseUrl}",
)

response = client.chat.completions.create(
    model="kimi-k2.6",
    messages=[{"role": "user", "content": "Xin chào"}],
)`
  return <main className="docs-shell">
    <header className="docs-top"><BrandLogo /><div className="page-actions"><Link href="/dashboard#quick-config" className="btn secondary">Quick Config</Link><Link href="/dashboard" className="btn">Dashboard</Link></div></header>
    <section className="docs-hero"><div className="docs-hero-copy"><div className="eyebrow">Developer Docs</div><h1>Tích hợp bằng API chuẩn OpenAI.</h1><p className="muted">Account dùng để vào Dashboard. API Key dạng <code>sk-apivn-…</code> chỉ dùng trong Authorization header.</p></div><pre className="docs-code"><code>{pythonExample}</code></pre></section>
    <div className="docs-grid"><nav className="surface docs-nav"><div className="eyebrow" style={{ marginBottom: 8 }}>Nội dung</div><a href="#quickstart">Quick start</a><a href="#openai">OpenAI SDK</a><a href="#node">JavaScript</a><a href="#claude">Claude Code</a><a href="#errors">Errors</a></nav><div className="docs-content">
      <section id="quickstart" className="surface docs-section"><div className="eyebrow">Quick start</div><h2>Bốn bước tới request đầu tiên</h2><div className="quick-config"><div className="config-item"><small>1 · Account</small><strong>Đăng ký và mở Dashboard</strong><p className="muted">Không cần nạp tiền trước khi xem console.</p></div><div className="config-item"><small>2 · API Key</small><strong>Create API Key</strong><p className="muted">Secret chỉ hiện một lần.</p></div><div className="config-item"><small>3 · Test</small><strong>Mở Playground</strong><p className="muted">Request đi qua gateway thật.</p></div><div className="config-item"><small>4 · Integrate</small><code>{baseUrl}</code></div></div></section>
      <section id="openai" className="surface docs-section"><h2>Python · OpenAI SDK</h2><pre className="docs-code"><code>{pythonExample}</code></pre></section>
      <section id="node" className="surface docs-section"><h2>JavaScript / TypeScript</h2><pre className="docs-code"><code>{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.APIVN_API_KEY,
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "kimi-k2.6",
  messages: [{ role: "user", content: "Xin chào" }],
});`}</code></pre></section>
      <section id="claude" className="surface docs-section"><h2>Claude Code</h2><p>Claude Code tự nối endpoint Messages, vì vậy Base URL không thêm <code>/v1</code>.</p><pre className="docs-code"><code>{`$env:ANTHROPIC_AUTH_TOKEN=$env:APIVN_API_KEY
$env:ANTHROPIC_BASE_URL="${gatewayUrl}"
claude --model "claude-sonnet-5"`}</code></pre></section>
      <section id="errors" className="surface docs-section"><h2>Error format</h2><pre className="docs-code"><code>{`{
  "error": {
    "message": "Insufficient balance",
    "type": "billing_error",
    "code": "insufficient_balance"
  }
}`}</code></pre></section>
    </div></div>
  </main>
}
