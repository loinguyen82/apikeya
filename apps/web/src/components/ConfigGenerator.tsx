'use client'

import { useEffect, useMemo, useState } from 'react'
import { CopyButton } from './CopyButton'

type Model = { id: string; display_name: string }
type AppId = 'opencode' | 'roo' | 'openclaw' | 'hermes' | 'codex' | 'claude'
type ConfigBlock = { label: string; content: string }
type GeneratedConfig = { blocks: ConfigBlock[]; note: string; beta?: boolean }

const apps: Array<{ id: AppId; label: string; beta?: boolean }> = [
  { id: 'opencode', label: 'OpenCode stable' },
  { id: 'roo', label: 'Roo / Cline' },
  { id: 'openclaw', label: 'OpenClaw' },
  { id: 'hermes', label: 'Hermes' },
  { id: 'codex', label: 'Codex CLI', beta: true },
  { id: 'claude', label: 'Claude Code', beta: true },
]

function buildConfig(app: AppId, model: string, apiKey: string, gatewayBaseUrl: string): GeneratedConfig {
  const key = apiKey.trim() || 'sk-APIVN_KEY_CUA_BAN'
  const gateway = gatewayBaseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
  const base = `${gateway}/v1`

  if (app === 'codex') {
    return {
      beta: true,
      note: 'Beta: APIVN đã hỗ trợ Responses text và function tools chuẩn; hosted tools như web search vẫn chưa được chuyển đổi.',
      blocks: [
        {
          label: '%USERPROFILE%\\.codex\\config.toml',
          content: `model = "${model}"
model_provider = "apivn"

[model_providers.apivn]
name = "APIVN"
base_url = "${base}"
env_key = "APIVN_API_KEY"
wire_api = "responses"`,
        },
        { label: 'PowerShell', content: `$env:APIVN_API_KEY = "${key}"
codex` },
      ],
    }
  }

  if (app === 'claude') {
    return {
      beta: true,
      note: 'Beta: Base URL không có /v1 vì Claude Code tự nối /v1/messages. Text và function tools chuẩn đã được chuyển đổi; độ tương thích vẫn phụ thuộc model.',
      blocks: [
        {
          label: 'PowerShell',
          content: `$env:ANTHROPIC_BASE_URL = "${gateway}"
$env:ANTHROPIC_AUTH_TOKEN = "${key}"

claude --model "${model}"`,
        },
      ],
    }
  }

  if (app === 'opencode') {
    return {
      note: 'Preset stable dùng provider OpenAI-compatible. Lưu JSON rồi đặt biến môi trường trước khi chạy.',
      blocks: [
        {
          label: 'opencode.json',
          content: `{
  "$schema": "https://opencode.ai/config.json",
  "model": "apivn/${model}",
  "provider": {
    "apivn": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "APIVN",
      "options": {
        "baseURL": "${base}",
        "apiKey": "{env:APIVN_API_KEY}"
      },
      "models": {
        "${model}": { "name": "${model}" }
      }
    }
  }
}`,
        },
        { label: 'PowerShell', content: `$env:APIVN_API_KEY = "${key}"
opencode` },
      ],
    }
  }

  if (app === 'roo') {
    return {
      note: 'Dán thủ công trong Settings rồi bấm Verify. Chọn model hỗ trợ native tool calling khi dùng coding agent.',
      blocks: [
        {
          label: 'Roo Code / Cline Settings',
          content: `API Provider: OpenAI Compatible
Base URL: ${base}
API Key: ${key}
Model ID: ${model}`,
        },
      ],
    }
  }

  if (app === 'openclaw') {
    return {
      note: 'Preset OpenClaw dùng Chat Completions và input text. Đặt APIVN_API_KEY trong môi trường trước khi chạy.',
      blocks: [
        {
          label: '%USERPROFILE%\\.openclaw\\openclaw.json',
          content: `{
  "agents": {
    "defaults": { "model": { "primary": "apivn/${model}" } }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "apivn": {
        "baseUrl": "${base}",
        "apiKey": "\${APIVN_API_KEY}",
        "api": "openai-completions",
        "models": [{
          "id": "${model}",
          "name": "${model}",
          "input": ["text"]
        }]
      }
    }
  }
}`,
        },
        { label: 'PowerShell', content: `$env:APIVN_API_KEY = "${key}"
openclaw models list --provider apivn` },
      ],
    }
  }

  return {
    note: 'Hermes dùng named custom provider theo schema hiện hành; transport chat_completions trỏ thẳng vào APIVN.',
    blocks: [
      { label: '~/.hermes/.env', content: `APIVN_API_KEY=${key}` },
      {
        label: '~/.hermes/config.yaml',
        content: `providers:
  apivn:
    api: ${base}
    key_env: APIVN_API_KEY
    transport: chat_completions

model:
  provider: custom:apivn
  default: ${model}`,
      },
      { label: 'PowerShell', content: 'hermes chat' },
    ],
  }
}

export function ConfigGenerator({ models, keyPrefix, gatewayBaseUrl }: { models: Model[]; keyPrefix?: string; gatewayBaseUrl: string }) {
  const [app, setApp] = useState<AppId>('opencode')
  const [model, setModel] = useState(models[0]?.id ?? '')
  const [apiKey, setApiKey] = useState('')
  const availableModels = useMemo(
    () => app === 'claude' ? models.filter((item) => item.id.toLowerCase().startsWith('claude-')) : models,
    [app, models],
  )

  useEffect(() => {
    if (!availableModels.some((item) => item.id === model)) {
      setModel(availableModels[0]?.id ?? '')
    }
  }, [availableModels, model])

  const config = useMemo(() => buildConfig(app, model, apiKey, gatewayBaseUrl), [app, model, apiKey, gatewayBaseUrl])

  if (models.length === 0) {
    return <section className="surface surface-pad"><div className="empty-card"><div className="empty-icon">C</div><strong>Chưa có model active để tạo config</strong><p>Hãy kiểm tra Model catalog hoặc quay lại khi gateway có model hoạt động.</p></div></section>
  }

  return (
    <div className="config-grid">
      <section className="surface config-controls">
        <div className="field">
          <label>Ứng dụng</label>
          <div className="config-apps">
            {apps.map((item) => (
              <button key={item.id} type="button" className={`config-app ${app === item.id ? 'active' : ''}`} aria-pressed={app === item.id} onClick={() => setApp(item.id)}>
                {item.label}{item.beta && <small>Beta</small>}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="config-model">Model active</label>
          <select id="config-model" className="input" value={model} onChange={(event) => setModel(event.target.value)}>
            {availableModels.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.id}</option>)}
          </select>
          {availableModels.length === 0 && <span className="field-hint">Ứng dụng này chưa có model tương thích đang active.</span>}
        </div>
        <div className="field">
          <label htmlFor="config-key">API key</label>
          <input id="config-key" className="input" type="password" autoComplete="off" spellCheck={false} placeholder={keyPrefix ? `${keyPrefix}••••••••` : 'sk-...'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          <span className="field-hint">Key chỉ nằm trong tab hiện tại và không được gửi lên server từ màn tạo config.</span>
        </div>
      </section>

      <section className="surface config-output">
        <div className="surface-head"><div><div className="eyebrow">Generated config</div><h2>{apps.find((item) => item.id === app)?.label} {config.beta && <span className="status-chip warning">Beta</span>}</h2></div></div>
        <div className="config-blocks">
          {config.blocks.map((block) => (
            <div className="config-block" key={block.label}>
              <div className="config-block-head"><strong>{block.label}</strong><CopyButton value={block.content} /></div>
              <pre className="config-code"><code>{block.content}</code></pre>
            </div>
          ))}
        </div>
        <div className="surface-body"><div className={`notice ${config.beta ? 'warning' : ''}`}>{config.note}</div></div>
      </section>
    </div>
  )
}
