'use client'

import React, { useState } from 'react'
import Link from 'next/link'

type Model = { id: string; display_name: string }
type Msg = { role: 'user' | 'assistant'; content: string }

export function PlaygroundClient({
  models,
  initialModel,
}: {
  models: Model[]
  initialModel: string
}) {
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
        body: JSON.stringify({
          model,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402 || data?.error?.code === 'INSUFFICIENT_BALANCE') {
          throw new Error('INSUFFICIENT_BALANCE')
        }
        throw new Error(data?.error?.message ?? 'Không nhận được phản hồi từ model')
      }

      const content = data?.choices?.[0]?.message?.content ?? '(Không có nội dung trả về)'
      setMessages([...next, { role: 'assistant', content }])

      if (data?.usage) {
        const totalTokens = (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0)
        setLastReceipt(`✓ Hoàn thành lượt gọi: ${totalTokens.toLocaleString('vi-VN')} tokens`)
      }
    } catch (e: any) {
      if (e?.message === 'INSUFFICIENT_BALANCE') {
        setError('Số dư dùng được của bạn chưa đủ để thực hiện lượt gọi này.')
      } else {
        setError(e instanceof Error ? e.message : 'Có lỗi xảy ra khi gọi AI')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      {models.length === 0 ? (
        <div className="empty-state" role="status">
          <strong>Chưa có model khả dụng</strong>
          <p className="muted">Hệ thống chưa bật model nào cho playground. Vui lòng quay lại sau hoặc xem tài liệu tích hợp.</p>
          <Link href="/docs" className="btn secondary">Mở tài liệu tích hợp →</Link>
        </div>
      ) : null}

      <div className="row">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '400px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Mô hình:</span>
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)} disabled={busy || models.length === 0}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name} ({m.id})
              </option>
            ))}
          </select>
        </label>
        {messages.length > 0 && (
          <button
            className="btn secondary"
            style={{ padding: '6px 12px', fontSize: '13px' }}
            onClick={() => {
              setMessages([])
              setError('')
              setLastReceipt(null)
            }}
          >
            Làm mới hội thoại
          </button>
        )}
      </div>

      <div className="chat">
        {messages.length === 0 && (
          <div className="chat-bubble">
            Xin chào! Hãy nhập câu hỏi bên dưới để thử nghiệm mô hình trực tiếp. Bạn không cần tạo API key để dùng thử.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role === 'user' ? 'user' : ''}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="chat-bubble" style={{ color: 'var(--text-muted)' }}>
            AI đang phản hồi...
          </div>
        )}
      </div>

      {lastReceipt && (
        <div style={{ color: 'var(--success)', fontSize: '13px', fontWeight: 500 }}>
          {lastReceipt}
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: 'var(--danger)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span role="alert">{error}</span>
          {error.includes('Số dư') && (
            <Link href="/dashboard/billing" className="btn" style={{ padding: '6px 12px', fontSize: '13px' }}>
              Nạp tiền ngay →
            </Link>
          )}
        </div>
      )}

      <div className="composer">
        <textarea
          className="input"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Nhập câu hỏi hoặc đoạn code... (Enter để gửi, Shift+Enter xuống dòng)"
          disabled={busy || models.length === 0}
        />
        <button className="btn" onClick={send} disabled={busy || !input.trim() || !model || models.length === 0}>
          {busy ? 'Đang gửi...' : 'Gửi'}
        </button>
      </div>

      <small className="muted">
        💡 Phiên dùng thử này sử dụng phiên đăng nhập web và trừ trực tiếp vào Số dư dịch vụ của bạn theo token thực tế.
      </small>
    </div>
  )
}
