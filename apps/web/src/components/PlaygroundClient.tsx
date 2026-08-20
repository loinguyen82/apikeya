'use client'

import React, { useState } from 'react'
import Link from 'next/link'

type Model = { id: string; display_name: string }
type Msg = { role: 'user' | 'assistant'; content: string }

export function PlaygroundClient({ models, initialModel }: { models: Model[]; initialModel: string }) {
  const [model, setModel] = useState(initialModel)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastReceipt, setLastReceipt] = useState<string | null>(null)

  async function send() {
    const text = input.trim()
    if (!text || busy || !model) return
    setBusy(true)
    setError('')
    setInput('')
    setLastReceipt(null)
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)

    try {
      const res = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402 || data?.error?.code === 'INSUFFICIENT_BALANCE') throw new Error('INSUFFICIENT_BALANCE')
        throw new Error(data?.error?.message ?? 'Không nhận được phản hồi từ model')
      }
      const content = data?.choices?.[0]?.message?.content ?? '(Không có nội dung trả về)'
      setMessages([...next, { role: 'assistant', content }])
      if (data?.usage) {
        const totalTokens = (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0)
        setLastReceipt(`Hoàn thành · ${totalTokens.toLocaleString('vi-VN')} tokens`)
      }
    } catch (e: any) {
      setError(e?.message === 'INSUFFICIENT_BALANCE' ? 'Số dư dùng được chưa đủ cho lượt gọi này.' : e instanceof Error ? e.message : 'Có lỗi xảy ra khi gọi AI')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setMessages([])
    setError('')
    setLastReceipt(null)
  }

  if (models.length === 0) {
    return <section className="surface surface-pad"><div className="empty-card"><div className="empty-icon">P</div><strong>Chưa có model khả dụng</strong><p>Hệ thống chưa bật model nào cho Playground.</p><Link href="/docs" className="btn secondary">Mở tài liệu</Link></div></section>
  }

  return (
    <section className="surface playground-shell">
      <aside className="playground-side">
        <div><div className="eyebrow">Session</div><h3 style={{ marginTop: 5 }}>Cấu hình thử nghiệm</h3></div>
        <div className="field">
          <label htmlFor="playground-model">Model</label>
          <select id="playground-model" className="input" value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
          <span className="field-hint"><code>{model}</code></span>
        </div>
        <div className="subtle-panel">
          <strong style={{ fontSize: 13 }}>Tính phí theo usage</strong>
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>Không cần API key cho Playground. Chi phí được ghi vào request logs của tài khoản.</p>
        </div>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 8 }}>
          <Link href="/dashboard/models" className="btn secondary">Xem model</Link>
          {messages.length > 0 && <button type="button" className="btn secondary" onClick={reset}>Xóa hội thoại</button>}
        </div>
      </aside>

      <div className="playground-main">
        <div className="conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-card" style={{ margin: 'auto', width: 'min(100%, 520px)' }}>
              <div className="empty-icon">→</div>
              <strong>Gửi request đầu tiên</strong>
              <p>Nhập prompt bên dưới để kiểm tra chất lượng model trước khi dùng trong ứng dụng.</p>
            </div>
          ) : messages.map((m, i) => <div key={i} className={`message ${m.role}`}>{m.content}</div>)}
          {busy && <div className="message assistant">Đang nhận phản hồi…</div>}
        </div>

        <div className="composer-bar">
          {lastReceipt && <div className="receipt">{lastReceipt}</div>}
          {error && <div className="notice danger" role="alert" style={{ marginBottom: 10 }}>{error}{error.includes('Số dư') && <> · <Link href="/dashboard/billing"><strong>Nạp thêm</strong></Link></>}</div>}
          <div className="composer-box">
            <textarea
              className="input"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Nhập prompt… Enter để gửi, Shift+Enter để xuống dòng"
              disabled={busy}
              aria-label="Prompt"
            />
            <button className="btn" onClick={send} disabled={busy || !input.trim() || !model}>{busy ? 'Đang gửi' : 'Gửi'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
