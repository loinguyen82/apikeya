'use client'

import { useState } from 'react'
import { CopyButton } from './CopyButton'

type Tab = 'curl' | 'python' | 'javascript' | 'claude' | 'codex' | 'openclaw' | 'sdk'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'openclaw', label: 'OpenClaw' },
  { id: 'sdk', label: 'OpenAI SDK' },
]

function example(tab: Tab, baseUrl: string, model: string) {
  const gateway = baseUrl.replace(/\/v1\/?$/, '')
  if (tab === 'curl') return [
    `curl ${baseUrl}/chat/completions \\`,
    '  -H "Authorization: Bearer $APIVN_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"model":"${model}","messages":[{"role":"user","content":"Xin chào"}]}'`,
  ].join('\n')
  if (tab === 'python') return `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["APIVN_API_KEY"],
    base_url="${baseUrl}",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Xin chào"}],
)`
  if (tab === 'javascript' || tab === 'sdk') return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.APIVN_API_KEY,
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Xin chào" }],
});`
  if (tab === 'claude') return `ANTHROPIC_BASE_URL=${gateway}
ANTHROPIC_AUTH_TOKEN=$APIVN_API_KEY

claude --model "${model}"`
  if (tab === 'codex') return `model = "${model}"
model_provider = "apivn"

[model_providers.apivn]
name = "APIVN"
base_url = "${baseUrl}"
env_key = "APIVN_API_KEY"
wire_api = "responses"`
  return `{
  "models": {
    "providers": {
      "apivn": {
        "baseUrl": "${baseUrl}",
        "apiKey": "\${APIVN_API_KEY}",
        "api": "openai-completions"
      }
    }
  }
}`
}

export function QuickConfig({ baseUrl, model }: { baseUrl: string; model: string }) {
  const [tab, setTab] = useState<Tab>('curl')
  const code = example(tab, baseUrl, model)
  return <section id="quick-config" className="surface quick-config-panel"><div className="surface-head"><div><div className="eyebrow">Quick Config</div><h2>Gọi API bằng công cụ của bạn</h2></div><CopyButton value={code} /></div><div className="code-tabs" role="tablist" aria-label="Quick Config">{tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div><pre className="quick-code"><code>{code}</code></pre><div className="surface-body"><p className="muted" style={{ margin: 0, fontSize: 12 }}>Mẫu dùng biến môi trường <code>APIVN_API_KEY</code>; không nhúng secret thật vào source code.</p></div></section>
}
