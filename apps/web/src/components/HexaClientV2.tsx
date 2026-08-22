'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HexaAnalysis, HexaConversationInput, HexaCountInput, HexaMessage } from '@aiapi/contracts'
import { analyzeLocalHexaInput, assertLocalHexaInputSize, type LocalHexaModel } from '@/lib/local-hexa'
import styles from './HexaClientV2.module.css'

type Model = LocalHexaModel

type Mode = 'text' | 'conversation'
type ViewMode = 'text' | 'ids'
type WorkerStatus = 'idle' | 'loading' | 'tokenizing' | 'ready' | 'error'

type TokenPiece = {
  id: number
  index: number
  token: string
  text: string
}

type TokenizerResult = {
  repo: string
  ids: number[]
  pieces: TokenPiece[]
}

type WorkerMessage =
  | { type: 'status'; requestId: number; status: Exclude<WorkerStatus, 'idle' | 'error'> }
  | { type: 'result'; requestId: number; repo: string; ids: number[]; pieces: TokenPiece[] }
  | { type: 'error'; requestId: number; message: string }

type TokenizerConfig = {
  repo: string
  label: string
  accuracy: 'official' | 'compatible'
}

const numberFormatter = new Intl.NumberFormat('en-US')

function formatNumber(value: number | null | undefined): string {
  return value == null ? '—' : numberFormatter.format(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textMetrics(text: string): { characters: number; words: number } {
  const words = text.trim().match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)
  return { characters: Array.from(text).length, words: words?.length ?? 0 }
}

function isHexaMessage(value: unknown): value is HexaMessage {
  return isRecord(value)
    && typeof value.role === 'string'
    && value.role.trim().length > 0
    && value.role.length <= 64
}

function parseConversationInput(raw: string): { input: HexaConversationInput; hasContent: boolean } {
  assertLocalHexaInputSize(raw)
  const parsed: unknown = JSON.parse(raw)

  if (Array.isArray(parsed)) {
    if (parsed.length > 256) throw new Error('Conversation JSON can contain at most 256 messages.')
    if (!parsed.every(isHexaMessage)) throw new Error('Every conversation message needs a non-empty role.')
    return { input: { type: 'conversation', messages: parsed }, hasContent: parsed.length > 0 }
  }

  if (!isRecord(parsed)) throw new Error('Conversation JSON must be an array or object with messages.')
  if (!Array.isArray(parsed.messages)) throw new Error('Conversation objects must include a messages array.')
  if (parsed.messages.length > 256) throw new Error('Conversation JSON can contain at most 256 messages.')
  if (!parsed.messages.every(isHexaMessage)) throw new Error('Every conversation message needs a non-empty role.')

  return {
    input: { ...parsed, type: 'conversation', messages: parsed.messages },
    hasContent: parsed.messages.length > 0 || Object.keys(parsed).some((key) => key !== 'messages'),
  }
}

function tokenizerConfigFor(model: Model | null): TokenizerConfig | null {
  const family = model?.tokenizerFamily?.trim()
  if (!family) return null

  if (family.startsWith('hf-official:')) {
    const repo = family.slice('hf-official:'.length).trim()
    return repo ? { repo, label: 'Official tokenizer · Hugging Face · Local', accuracy: 'official' } : null
  }

  if (family.startsWith('hf-compatible:')) {
    const repo = family.slice('hf-compatible:'.length).trim()
    return repo ? { repo, label: 'Compatible tokenizer · Hugging Face · Local', accuracy: 'compatible' } : null
  }

  if (family.startsWith('hf:')) {
    const repo = family.slice('hf:'.length).trim()
    return repo ? { repo, label: 'Hugging Face tokenizer · Local', accuracy: 'compatible' } : null
  }

  if (family === 'openai_o200k_compatible') {
    return {
      repo: 'Xenova/gpt-4o',
      label: 'o200k-compatible · Hugging Face · Local',
      accuracy: 'compatible',
    }
  }

  return null
}

function ContextWindow({ total, limit }: { total: number; limit: number | null }) {
  if (!limit) {
    return (
      <div className={styles.context}>
        <div className={styles.contextLabel}>
          <strong>{formatNumber(total)} tokens</strong>
          <span>Context limit —</span>
        </div>
      </div>
    )
  }

  const percentage = (total / limit) * 100
  const fillClass = percentage >= 90 ? styles.danger : percentage >= 72 ? styles.warning : undefined

  return (
    <div className={styles.context}>
      <div className={styles.contextLabel}>
        <strong>{formatNumber(total)} / {formatNumber(limit)} tokens</strong>
        <span>{percentage.toFixed(1)}%</span>
      </div>
      <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percentage)}>
        <span className={fillClass} style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </div>
  )
}

function tokenizerStatusLabel(status: WorkerStatus, config: TokenizerConfig | null): string {
  if (!config) return 'Estimated tokenizer'
  if (status === 'loading') return 'Loading tokenizer…'
  if (status === 'tokenizing') return 'Tokenizing…'
  if (status === 'ready') return 'Ready · Local'
  if (status === 'error') return 'Tokenizer fallback'
  return config.label
}

export function HexaClientV2({ models, initialModel }: { models: Model[]; initialModel: string }) {
  const [mode, setMode] = useState<Mode>('text')
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [model, setModel] = useState(initialModel)
  const [text, setText] = useState('')
  const [conversation, setConversation] = useState('[\n]\n')
  const [analysis, setAnalysis] = useState<HexaAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [tokenizerResult, setTokenizerResult] = useState<TokenizerResult | null>(null)
  const [tokenizerStatus, setTokenizerStatus] = useState<WorkerStatus>('idle')
  const [tokenizerError, setTokenizerError] = useState('')

  const workerRef = useRef<Worker | null>(null)
  const tokenRequestRef = useRef(0)
  const analysisRequestRef = useRef(0)

  const selectedModel = useMemo(() => models.find((candidate) => candidate.id === model) ?? null, [model, models])
  const tokenizerConfig = useMemo(() => tokenizerConfigFor(selectedModel), [selectedModel])
  const localText = useMemo(() => textMetrics(text), [text])

  useEffect(() => {
    const worker = new Worker(new URL('../workers/hexa-tokenizer.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (!message || message.requestId !== tokenRequestRef.current) return

      if (message.type === 'status') {
        setTokenizerStatus(message.status)
        return
      }

      if (message.type === 'result') {
        setTokenizerResult({ repo: message.repo, ids: message.ids, pieces: message.pieces })
        setTokenizerError('')
        setTokenizerStatus('ready')
        return
      }

      if (message.type === 'error') {
        setTokenizerResult(null)
        setTokenizerError(message.message)
        setTokenizerStatus('error')
      }
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextUrl = new URL(window.location.href)
    if (model) nextUrl.searchParams.set('model', model)
    else nextUrl.searchParams.delete('model')
    window.history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}`)
  }, [model])

  useEffect(() => {
    const requestId = ++tokenRequestRef.current
    setTokenizerResult(null)
    setTokenizerError('')

    if (mode !== 'text' || !text || !tokenizerConfig || !workerRef.current) {
      setTokenizerStatus('idle')
      return
    }

    const timer = window.setTimeout(() => {
      workerRef.current?.postMessage({
        id: requestId,
        type: 'tokenize',
        repo: tokenizerConfig.repo,
        text,
      })
    }, 180)

    return () => window.clearTimeout(timer)
  }, [mode, text, tokenizerConfig])

  const buildAnalysisInput = useCallback((): { input: HexaCountInput; hasContent: boolean } => {
    if (mode === 'text') {
      assertLocalHexaInputSize(text)
      return { input: { type: 'text', text }, hasContent: text.length > 0 }
    }
    return parseConversationInput(conversation)
  }, [conversation, mode, text])

  useEffect(() => {
    const requestId = ++analysisRequestRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        let request: { input: HexaCountInput; hasContent: boolean }
        try {
          request = buildAnalysisInput()
        } catch (error) {
          if (requestId !== analysisRequestRef.current) return
          setAnalysis(null)
          setAnalysisError(error instanceof Error ? error.message : 'Invalid input.')
          return
        }

        if (!request.hasContent || !selectedModel) {
          if (requestId !== analysisRequestRef.current) return
          setAnalysis(null)
          setAnalysisError('')
          return
        }

        try {
          const result = await analyzeLocalHexaInput(selectedModel, request.input)
          if (requestId !== analysisRequestRef.current) return
          setAnalysis(result)
          setAnalysisError('')
        } catch (error) {
          if (requestId !== analysisRequestRef.current) return
          setAnalysis(null)
          setAnalysisError(error instanceof Error ? error.message : 'Unable to analyze input.')
        }
      })()
    }, 180)

    return () => window.clearTimeout(timer)
  }, [buildAnalysisInput, selectedModel])

  const hfTokenCount = tokenizerResult?.ids.length ?? null
  const textTokenCount = hfTokenCount ?? analysis?.count.tokens ?? 0
  const conversationAnalysis = analysis?.conversation

  return (
    <div className={styles.app}>
      <div className={styles.topbar}>
        <div className={styles.titleWrap}>
          <span className={styles.eyebrow}>TOKENIZER PLAYGROUND</span>
          <h1>Hexa</h1>
          <p className={styles.subtitle}>Tokenizer playground · Runs locally in your browser</p>
        </div>
        <label className={styles.modelSelect}>
          <span>Model</span>
          <select value={model} onChange={(event) => setModel(event.target.value)} disabled={models.length === 0}>
            {models.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>{candidate.displayName} ({candidate.id})</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.metaRow}>
        <span className={styles.localBadge}>Your text stays in this browser</span>
        <span className={styles.statusBadge}>{tokenizerStatusLabel(tokenizerStatus, tokenizerConfig)}</span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Hexa mode">
        <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? styles.active : ''} onClick={() => setMode('text')}>Text</button>
        <button type="button" role="tab" aria-selected={mode === 'conversation'} className={mode === 'conversation' ? styles.active : ''} onClick={() => setMode('conversation')}>Conversation</button>
      </div>

      {models.length === 0 ? <div className={styles.warningBox}>No active models are available for token analysis.</div> : null}
      {analysisError ? <div className={styles.errorBox}>{analysisError}</div> : null}

      {mode === 'text' ? (
        <>
          <div className={styles.workspace}>
            <section className={styles.editorPane}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Input</h2>
                  <p>Paste text and Hexa will tokenize it locally.</p>
                </div>
              </div>
              <textarea
                className={styles.editor}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste text…"
                spellCheck={false}
                aria-label="Text to tokenize"
              />
              <div className={styles.editorMeta}>
                <span>{formatNumber(localText.characters)} characters</span>
                <span>{formatNumber(localText.words)} words</span>
              </div>
            </section>

            <aside className={styles.statsPane}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Statistics</h2>
                  <p>{tokenizerConfig?.label ?? 'Deterministic local fallback'}</p>
                </div>
              </div>
              <div className={styles.statList}>
                <div><span>Tokens</span><strong>{text ? (tokenizerStatus === 'loading' || tokenizerStatus === 'tokenizing' ? '…' : formatNumber(textTokenCount)) : '0'}</strong></div>
                <div><span>Characters</span><strong>{formatNumber(localText.characters)}</strong></div>
                <div><span>Words</span><strong>{formatNumber(localText.words)}</strong></div>
              </div>
              <ContextWindow total={textTokenCount} limit={selectedModel?.contextWindowTokens ?? null} />
            </aside>
          </div>

          <section className={styles.visualizer}>
            <div className={styles.visualizerHeader}>
              <div>
                <h2>Tokens</h2>
                <p>{tokenizerResult ? `${formatNumber(tokenizerResult.ids.length)} tokens · ${tokenizerResult.repo}` : 'Token boundaries appear here.'}</p>
              </div>
              <div className={styles.viewTabs} role="tablist" aria-label="Token display mode">
                <button type="button" role="tab" aria-selected={viewMode === 'text'} className={viewMode === 'text' ? styles.active : ''} onClick={() => setViewMode('text')}>Text</button>
                <button type="button" role="tab" aria-selected={viewMode === 'ids'} className={viewMode === 'ids' ? styles.active : ''} onClick={() => setViewMode('ids')}>Token IDs</button>
              </div>
            </div>

            {!text ? (
              <div className={styles.empty}>Paste text above to see its tokenizer boundaries.</div>
            ) : tokenizerResult ? (
              viewMode === 'text' ? (
                <div className={styles.tokenCanvas} aria-label="Tokenized text">
                  {tokenizerResult.pieces.map((piece) => (
                    <span
                      key={`${piece.index}-${piece.id}`}
                      className={`${styles.token} ${styles[`token${piece.index % 5}`]}`}
                      title={`#${piece.index} · ID ${piece.id} · ${JSON.stringify(piece.token)}`}
                    >
                      {piece.text}
                    </span>
                  ))}
                </div>
              ) : (
                <pre className={styles.ids}>[{tokenizerResult.ids.join(', ')}]</pre>
              )
            ) : (
              <div className={styles.empty}>
                {tokenizerStatus === 'loading' ? 'Loading Hugging Face tokenizer…' : tokenizerStatus === 'tokenizing' ? 'Tokenizing…' : 'This model does not have a verified Hugging Face tokenizer mapping yet.'}
              </div>
            )}

            {tokenizerError ? (
              <div className={styles.warningBox}>Hugging Face tokenizer could not load, so Hexa is using its existing local fallback count. {tokenizerError}</div>
            ) : null}
            <p className={styles.note}>Token colors alternate only for readability. Raw prompt text is not sent to APIVN, Supabase, or an upstream model provider.</p>
          </section>
        </>
      ) : (
        <section className={styles.conversationPanel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Conversation JSON</h2>
              <p>Advanced context analysis stays separate from the lightweight tokenizer playground.</p>
            </div>
          </div>
          <textarea
            className={`${styles.editor} ${styles.jsonEditor}`}
            value={conversation}
            onChange={(event) => setConversation(event.target.value)}
            spellCheck={false}
            aria-label="Conversation JSON"
          />

          {conversationAnalysis ? (
            <>
              <div className={styles.metricGrid}>
                <div><span>Current context</span><strong>{formatNumber(conversationAnalysis.currentContextTokens)}</strong></div>
                <div><span>Cumulative input</span><strong>{formatNumber(conversationAnalysis.cumulativeInputTokens)}</strong></div>
                <div><span>Re-read context</span><strong>{formatNumber(conversationAnalysis.reReadContextTokens)}</strong></div>
              </div>
              <ContextWindow total={conversationAnalysis.currentContextTokens} limit={analysis?.contextWindowTokens ?? null} />

              <div className={styles.breakdown}>
                <h3>Breakdown</h3>
                <div><span>System</span><strong>{formatNumber(conversationAnalysis.breakdown.systemTokens)}</strong></div>
                <div><span>History</span><strong>{formatNumber(conversationAnalysis.breakdown.historyTokens)}</strong></div>
                <div><span>Current message</span><strong>{formatNumber(conversationAnalysis.breakdown.currentMessageTokens)}</strong></div>
                <div><span>Tools</span><strong>{formatNumber(conversationAnalysis.breakdown.toolTokens)}</strong></div>
                <div><span>Other / framing</span><strong>{formatNumber(conversationAnalysis.breakdown.otherTokens + conversationAnalysis.breakdown.protocolDeltaTokens)}</strong></div>
              </div>

              <div className={styles.growth}>
                <table>
                  <thead><tr><th>Turn</th><th>Input</th><th>Output</th></tr></thead>
                  <tbody>
                    {conversationAnalysis.growth.map((point) => (
                      <tr key={point.turn}>
                        <td>{point.turn}</td>
                        <td>{formatNumber(point.inputTokens)}</td>
                        <td>{point.outputTokens == null ? '—' : formatNumber(point.outputTokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={styles.empty}>Add messages to inspect context growth and conversation overhead.</div>
          )}
        </section>
      )}
    </div>
  )
}
