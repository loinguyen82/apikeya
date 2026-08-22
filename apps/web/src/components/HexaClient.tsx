'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HexaAnalysis, HexaContextGrowthPoint, HexaConversationInput, HexaCountInput, HexaMessage, TokenCountAccuracy } from '@aiapi/contracts'
import { analyzeLocalHexaInput, assertLocalHexaInputSize, type LocalHexaModel } from '@/lib/local-hexa'

type Model = LocalHexaModel

const numberFormatter = new Intl.NumberFormat('en-US')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textMetrics(text: string): { characters: number; words: number } {
  const words = text.trim().match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)
  return { characters: Array.from(text).length, words: words?.length ?? 0 }
}

function accuracyLabel(accuracy: TokenCountAccuracy): string {
  switch (accuracy) {
    case 'provider_native': return 'Local native tokenizer'
    case 'official_tokenizer': return 'Local official tokenizer'
    case 'compatible_tokenizer': return 'Local compatible tokenizer'
    default: return 'Local estimate'
  }
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? '—' : numberFormatter.format(value)
}

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function isHexaMessage(value: unknown): value is HexaMessage {
  return isRecord(value)
    && typeof value.role === 'string'
    && value.role.trim().length > 0
    && value.role.length <= 64
}

function assertConversationMessages(messages: unknown[]): asserts messages is HexaMessage[] {
  if (messages.length > 256) throw new Error('Conversation JSON can contain at most 256 messages.')
  if (!messages.every(isHexaMessage)) throw new Error('Every conversation message needs a non-empty role.')
}

function parseConversationInput(raw: string): { input: HexaConversationInput; hasContent: boolean } {
  assertLocalHexaInputSize(raw)
  const parsed: unknown = JSON.parse(raw)
  if (Array.isArray(parsed)) {
    assertConversationMessages(parsed)
    return { input: { type: 'conversation', messages: parsed }, hasContent: parsed.length > 0 }
  }
  if (!isRecord(parsed)) throw new Error('Conversation JSON must be an array of messages or an object with messages.')
  if ('type' in parsed && parsed.type !== 'conversation') {
    throw new Error('Top-level type is reserved by Hexa. Use a conversation object with messages instead.')
  }
  if (!Array.isArray(parsed.messages)) throw new Error('Conversation objects must include a messages array.')
  assertConversationMessages(parsed.messages)
  return {
    input: { ...parsed, type: 'conversation', messages: parsed.messages },
    hasContent: parsed.messages.length > 0 || 'system' in parsed || 'tools' in parsed || Object.keys(parsed).some((key) => !['type', 'messages'].includes(key)),
  }
}

function ContextWindow({ total, limit }: { total: number; limit: number | null }) {
  if (!limit) {
    return (
      <div className="hexa-window hexa-window-unknown">
        <div className="hexa-window-label">
          <strong>{formatNumber(total)} tokens</strong>
          <span>Limit —</span>
        </div>
        <p className="hexa-window-unavailable">No verified context-window metadata is set for this model.</p>
      </div>
    )
  }
  const percentage = (total / limit) * 100
  const state = percentage >= 100 ? 'over' : percentage >= 90 ? 'critical' : percentage >= 72 ? 'warning' : 'normal'
  return (
    <div className="hexa-window">
      <div className="hexa-window-label">
        <strong>{formatNumber(total)} / {formatNumber(limit)} tokens</strong>
        <span>{percentage.toFixed(1)}% · {state === 'over' ? 'Over limit' : state[0].toUpperCase() + state.slice(1)}</span>
      </div>
      <div
        className="hexa-progress"
        role="progressbar"
        aria-label="Context window usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percentage, 100)}
        aria-valuetext={`${formatNumber(total)} of ${formatNumber(limit)} tokens, ${percentage.toFixed(1)} percent used`}
      >
        <span className={`hexa-progress-fill ${state}`} style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
    </div>
  )
}

function ContextGrowthChart({ points }: { points: HexaContextGrowthPoint[] }) {
  if (points.length === 0) return <p className="hexa-empty">Add user turns to see input context growth.</p>
  const width = 720
  const height = 210
  const padding = { top: 16, right: 20, bottom: 35, left: 58 }
  const maximum = Math.max(...points.map((point) => point.inputTokens), 1)
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const coordinates = points.map((point, index) => ({
    x: padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: padding.top + (1 - point.inputTokens / maximum) * plotHeight,
  }))
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const guideValues = [0, 0.5, 1].map((ratio) => Math.round(maximum * ratio))

  return (
    <div className="hexa-growth-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Input token context by user turn" className="hexa-growth-chart">
        {guideValues.map((value) => {
          const y = padding.top + (1 - value / maximum) * plotHeight
          return <g key={value}><line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="hexa-chart-grid" /><text x={padding.left - 9} y={y + 4} textAnchor="end" className="hexa-chart-label">{formatNumber(value)}</text></g>
        })}
        <path d={path} className="hexa-chart-line" />
        {coordinates.map((point, index) => <circle key={points[index].turn} cx={point.x} cy={point.y} r="4" className="hexa-chart-dot"><title>Turn {points[index].turn}: {formatNumber(points[index].inputTokens)} input tokens</title></circle>)}
        {coordinates.map((point, index) => <text key={`label-${points[index].turn}`} x={point.x} y={height - 12} textAnchor="middle" className="hexa-chart-label">{points[index].turn}</text>)}
      </svg>
      <div className="hexa-growth-table-wrap">
        <table className="hexa-growth-table">
          <thead><tr><th>Turn</th><th>Input</th><th>Output</th></tr></thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.turn}>
                <td>{point.turn}</td>
                <td>{formatNumber(point.inputTokens)}</td>
                <td>{point.outputTokens == null ? '—' : formatNumber(point.outputTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function HexaClient({ models, initialModel }: { models: Model[]; initialModel: string }) {
  const [mode, setMode] = useState<'text' | 'conversation'>('text')
  const [model, setModel] = useState(initialModel)
  const [text, setText] = useState('')
  const [conversation, setConversation] = useState('[\n]\n')
  const [analysis, setAnalysis] = useState<HexaAnalysis | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestSequence = useRef(0)
  const localText = useMemo(() => textMetrics(text), [text])
  const selectedModel = useMemo(() => models.find((candidate) => candidate.id === model) ?? null, [model, models])

  const buildInput = useCallback((): { input: HexaCountInput; hasContent: boolean } => {
    if (mode === 'text') {
      assertLocalHexaInputSize(text)
      return { input: { type: 'text', text }, hasContent: text.length > 0 }
    }
    return parseConversationInput(conversation)
  }, [conversation, mode, text])

  const analyze = useCallback(async (sequence: number) => {
    let request: { input: HexaCountInput; hasContent: boolean }
    try {
      request = buildInput()
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setAnalysis(null)
        setError(cause instanceof Error ? cause.message : 'Invalid conversation JSON.')
        setBusy(false)
      }
      return
    }
    if (!request.hasContent || !selectedModel) {
      if (sequence === requestSequence.current) {
        setAnalysis(null)
        setError('')
        setBusy(false)
      }
      return
    }

    if (sequence === requestSequence.current) {
      setBusy(true)
      setError('')
    }
    try {
      const result = await analyzeLocalHexaInput(selectedModel, request.input)
      if (sequence === requestSequence.current) setAnalysis(result)
    } catch (cause) {
      if (sequence !== requestSequence.current) return
      setAnalysis(null)
      setError(cause instanceof Error ? cause.message : 'Unable to analyze this input.')
    } finally {
      if (sequence === requestSequence.current) setBusy(false)
    }
  }, [buildInput, selectedModel])

  useEffect(() => {
    const sequence = ++requestSequence.current
    const timer = window.setTimeout(() => { void analyze(sequence) }, 180)
    return () => {
      window.clearTimeout(timer)
      if (requestSequence.current === sequence) requestSequence.current += 1
    }
  }, [analyze])

  const conversationAnalysis = analysis?.conversation
  const total = analysis?.count.tokens ?? 0

  return (
    <div className="hexa-app">
      <div className="hexa-topbar">
        <div>
          <span className="eyebrow">TOKEN ANALYZER</span>
          <h1>Hexa</h1>
          <p className="muted">Runs locally in this browser. Your input is never sent to APIVN or a model provider, and never uses quota or credits.</p>
        </div>
        <label className="hexa-model-select">
          <span>Model</span>
          <select value={model} onChange={(event) => setModel(event.target.value)} disabled={models.length === 0}>
            {models.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.displayName} ({candidate.id})</option>)}
          </select>
        </label>
      </div>

      {models.length === 0 ? <div className="hexa-notice">No active models are available for token analysis.</div> : null}

      <div className="hexa-local-only" role="status">Local only <span aria-hidden="true">·</span> no prompt upload <span aria-hidden="true">·</span> no token charge</div>

      <div className="hexa-mode-tabs" role="tablist" aria-label="Hexa mode">
        <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>Text</button>
        <button type="button" role="tab" aria-selected={mode === 'conversation'} className={mode === 'conversation' ? 'active' : ''} onClick={() => setMode('conversation')}>Conversation</button>
      </div>

      <div className="hexa-main-grid">
        <section className="hexa-editor-panel">
          <div className="hexa-panel-header">
            <div>
              <h2>{mode === 'text' ? 'Input' : 'Conversation JSON'}</h2>
              <p>{mode === 'text' ? 'Paste text to count it.' : 'Use a message array or an object with system, messages, tools, and provider-specific fields.'}</p>
            </div>
          </div>
          {mode === 'text' ? (
            <textarea className="hexa-editor" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste text…" spellCheck={false} aria-label="Text to analyze" />
          ) : (
            <textarea className="hexa-editor hexa-json-editor" value={conversation} onChange={(event) => setConversation(event.target.value)} spellCheck={false} aria-label="Conversation JSON" />
          )}
          <p className="hexa-editor-note">{mode === 'text' ? `${formatNumber(localText.characters)} characters · ${formatNumber(localText.words)} words` : 'JSON is parsed only for analysis. Embedded code is never executed.'}</p>
        </section>

        <aside className="hexa-analysis-panel">
          <div className="hexa-panel-header">
            <div><h2>Analysis</h2><p>{busy ? 'Counting…' : analysis ? accuracyLabel(analysis.count.accuracy) : 'Waiting for input'}</p></div>
            {analysis ? <span className={`hexa-accuracy ${analysis.count.accuracy}`}>{accuracyLabel(analysis.count.accuracy)}</span> : null}
          </div>

          {error ? <div className="hexa-error">{error}</div> : null}

          {mode === 'text' ? (
            <>
              <div className="hexa-stat-list">
                <div><span>Characters</span><strong>{formatNumber(analysis?.text?.characters ?? localText.characters)}</strong></div>
                <div><span>Words</span><strong>{formatNumber(analysis?.text?.words ?? localText.words)}</strong></div>
                <div><span>Tokens</span><strong>{analysis ? formatNumber(analysis.count.tokens) : text ? '…' : '0'}</strong></div>
              </div>
              {analysis ? <ContextWindow total={analysis.count.tokens} limit={analysis.contextWindowTokens} /> : null}
            </>
          ) : conversationAnalysis ? (
            <>
              <div className="hexa-primary-stat"><span>Current conversation context</span><strong>{formatNumber(conversationAnalysis.currentContextTokens)} tokens</strong></div>
              <ContextWindow total={conversationAnalysis.currentContextTokens} limit={analysis?.contextWindowTokens ?? null} />
              <div className="hexa-metric-grid">
                <div><span>Cumulative input processed</span><strong>{formatNumber(conversationAnalysis.cumulativeInputTokens)}</strong></div>
                <div><span>New content</span><strong>{formatNumber(conversationAnalysis.newContentTokens)}</strong></div>
                <div><span>Re-read context</span><strong>{formatNumber(conversationAnalysis.reReadContextTokens)}</strong></div>
              </div>
              <div className="hexa-breakdown">
                <h3>Breakdown</h3>
                {[
                  ['System', conversationAnalysis.breakdown.systemTokens],
                  ['History', conversationAnalysis.breakdown.historyTokens],
                  ['Current message', conversationAnalysis.breakdown.currentMessageTokens],
                  ['Tools', conversationAnalysis.breakdown.toolTokens],
                  ['Other / framing', conversationAnalysis.breakdown.otherTokens + conversationAnalysis.breakdown.protocolDeltaTokens],
                ].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{formatNumber(value as number)}</strong></div>)}
                <div className="total"><span>Total</span><strong>{formatNumber(total)}</strong></div>
              </div>
              {conversationAnalysis.historyTax != null || conversationAnalysis.contextAmplification != null ? (
                <div className="hexa-derived">
                  {conversationAnalysis.historyTax != null ? <span>History Tax <strong>{formatPercent(conversationAnalysis.historyTax)}</strong></span> : null}
                  {conversationAnalysis.contextAmplification != null ? <span>Context amplification <strong>{conversationAnalysis.contextAmplification.toFixed(1)}×</strong></span> : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="hexa-empty">Paste a structured conversation to see its context, message breakdown, and growth.</p>
          )}
        </aside>
      </div>

      {conversationAnalysis ? (
        <section className="hexa-growth-panel">
          <div className="hexa-panel-header"><div><h2>Context Growth</h2><p>Input context sent at each user turn. This is distinct from cumulative processing.</p></div></div>
          <ContextGrowthChart points={conversationAnalysis.growth} />
          <details className="hexa-message-details">
            <summary>Per-message inspection</summary>
            <div>{conversationAnalysis.messageCounts.map((message) => <div key={message.index}><span>{message.label}</span><strong>{formatNumber(message.tokens)} tokens</strong></div>)}</div>
          </details>
          <p className="hexa-method-note">All analysis stays in this browser. Growth output is the encoded assistant payload in the supplied JSON, not billed request usage. Compatible counters include a documented protocol/framing allowance; estimates do not claim provider billing precision.</p>
        </section>
      ) : null}
    </div>
  )
}
