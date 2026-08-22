'use client'

import { useState } from 'react'
import Link from 'next/link'
import { QuickConfig } from './QuickConfig'

type Model = { id: string; display_name: string; default_max_output_tokens: number; max_output_tokens: number }
type Receipt = { latencyMs: number; promptTokens: number; completionTokens: number; costMicros: number }

export function PlaygroundClient({ models, initialModel, baseUrl }: { models: Model[]; initialModel: string; baseUrl: string }) {
  const initial = models.find((item) => item.id === initialModel) ?? models[0]
  const [model, setModel] = useState(initialModel)
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(Math.min(initial?.default_max_output_tokens ?? 1024, 4096))
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    if (!prompt.trim() || busy || !model) return
    setBusy(true)
    setError('')
    setResponse('')
    setReceipt(null)
    const localStarted = performance.now()
    try {
      const result = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt.trim() }] }),
      })
      const data = await result.json().catch(() => null)
      if (!result.ok) {
        if (result.status === 402 || data?.error?.code === 'insufficient_balance') throw new Error('Số dư không đủ để chạy request này.')
        throw new Error(data?.error?.message || 'Không nhận được phản hồi từ model')
      }
      const content = data?.choices?.[0]?.message?.content
      setResponse(typeof content === 'string' && content ? content : '(Không có nội dung trả về)')
      setReceipt({
        latencyMs: Number(result.headers.get('x-apivn-latency-ms')) || Math.round(performance.now() - localStarted),
        promptTokens: data?.usage?.prompt_tokens ?? 0,
        completionTokens: data?.usage?.completion_tokens ?? 0,
        costMicros: Number(result.headers.get('x-apivn-cost-micros')) || 0,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Có lỗi xảy ra khi gọi gateway')
    } finally {
      setBusy(false)
    }
  }

  if (!models.length) return <section className="surface surface-pad"><div className="empty-card"><div className="empty-icon">P</div><strong>Chưa có model khả dụng</strong><p>Gateway chưa bật model nào cho Playground.</p><Link href="/docs" className="btn secondary">Mở Docs</Link></div></section>

  const selected = models.find((item) => item.id === model) ?? models[0]
  const vndCost = receipt ? new Intl.NumberFormat('vi-VN').format(Math.floor(receipt.costMicros / 1000)) : '0'
  return <div className="page-stack">
    <section className="surface playground-workbench">
      <div className="playground-controls"><div className="field"><label htmlFor="playground-model">Model</label><select id="playground-model" className="input" value={model} disabled={busy} onChange={(event) => { const next = models.find((item) => item.id === event.target.value); setModel(event.target.value); if (next) setMaxTokens(Math.min(next.default_max_output_tokens, 4096)) }}>{models.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.id}</option>)}</select></div><div className="field"><label htmlFor="temperature">Temperature</label><input id="temperature" className="input" type="number" min="0" max="2" step="0.1" value={temperature} disabled={busy} onChange={(event) => setTemperature(Number(event.target.value))} /></div><div className="field"><label htmlFor="max-tokens">Max tokens</label><input id="max-tokens" className="input" type="number" min="1" max={selected.max_output_tokens} value={maxTokens} disabled={busy} onChange={(event) => setMaxTokens(Number(event.target.value))} /></div></div>
      <div className="playground-panes"><div className="playground-pane"><div className="pane-head"><strong>Prompt</strong><span>Shift+Enter xuống dòng</span></div><textarea className="playground-editor" aria-label="Prompt" value={prompt} disabled={busy} placeholder="Nhập prompt để test gateway thật…" onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); run() } }} /></div><div className="playground-pane"><div className="pane-head"><strong>Response</strong><span>{model}</span></div><div className={`playground-response ${!response ? 'empty' : ''}`} aria-live="polite">{busy ? 'Đang nhận phản hồi từ gateway…' : response || 'Response sẽ xuất hiện ở đây.'}</div></div></div>
      <div className="playground-footer"><div>{receipt ? <div className="receipt-metrics"><span>Latency <strong>{(receipt.latencyMs / 1000).toFixed(2)}s</strong></span><span>Prompt <strong>{receipt.promptTokens.toLocaleString('vi-VN')}</strong></span><span>Completion <strong>{receipt.completionTokens.toLocaleString('vi-VN')}</strong></span><span>Total cost <strong>{vndCost} ₫</strong></span></div> : <span className="muted">Request dùng gateway production và ghi Usage thật.</span>}</div><button className="btn" type="button" onClick={run} disabled={busy || !prompt.trim()}>{busy ? 'Đang chạy…' : 'Run'}</button></div>
    </section>
    {error && <div className="notice danger" role="alert">{error}{error.includes('Số dư') && <> <Link href="/dashboard/billing"><strong>Nạp tiền</strong></Link></>}</div>}
    <QuickConfig baseUrl={baseUrl} model={model} />
  </div>
}
