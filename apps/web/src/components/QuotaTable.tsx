'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import styles from './QuotaTable.module.css'

export type QuotaRequestRow = {
  id: string
  createdAt: string
  modelId: string
  modelDisplayName: string | null
  requestedModelId: string | null
  providerId: string | null
  status: string
  stream: boolean
  inputTokens: number | null
  cachedInputTokens: number | null
  cacheCreationInputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  totalTokens: number | null
  retailCostMicros: string | number | null
  startedAt: string | null
  firstTokenAt: string | null
  completedAt: string | null
}

const numberFormatter = new Intl.NumberFormat('en-US')
const ONE_MILLION = 1_000_000n

function formatTokens(value: number | null): string {
  return value == null ? '—' : numberFormatter.format(value)
}

function elapsedMs(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const milliseconds = Date.parse(end) - Date.parse(start)
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null
}

function formatSeconds(milliseconds: number | null): string {
  return milliseconds == null ? '—' : `${(milliseconds / 1000).toFixed(1)}s`
}

function tokensPerSecond(row: QuotaRequestRow): string {
  if (!row.stream || row.outputTokens == null || row.outputTokens <= 0) return '—'
  const generationMs = elapsedMs(row.firstTokenAt, row.completedAt)
  if (generationMs == null || generationMs <= 0) return '—'
  return `${Math.round(row.outputTokens / (generationMs / 1000))} t/s`
}

function formatCost(value: QuotaRequestRow['retailCostMicros']): string {
  if (value == null) return '—'
  try {
    const micros = BigInt(value)
    if (micros === 0n) return '₫0'
    const wholeVnd = micros / 1000n
    if (wholeVnd === 0n) return '<₫1'
    return `₫${numberFormatter.format(wholeVnd)}`
  } catch {
    return '—'
  }
}

function tokenCountForRate(row: QuotaRequestRow): bigint | null {
  const total = row.totalTokens ?? ((row.inputTokens ?? 0) + (row.outputTokens ?? 0))
  if (!Number.isSafeInteger(total) || total <= 0) return null
  return BigInt(total)
}

function ratePerMillion(row: QuotaRequestRow): string {
  if (row.status !== 'settled' || row.retailCostMicros == null) return '—'
  const tokenCount = tokenCountForRate(row)
  if (tokenCount == null) return '—'

  try {
    const requestCostMicros = BigInt(row.retailCostMicros)
    const normalizedMicros = (requestCostMicros * ONE_MILLION + tokenCount / 2n) / tokenCount
    return `${formatCost(normalizedMicros)} / 1M`
  } catch {
    return '—'
  }
}

function pageItems(page: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((item) => item >= 1 && item <= pageCount))
  const ordered = [...pages].sort((a, b) => a - b)
  const result: Array<number | 'ellipsis'> = []
  for (const item of ordered) {
    const previous = result[result.length - 1]
    if (typeof previous === 'number' && item - previous > 1) result.push('ellipsis')
    result.push(item)
  }
  return result
}

export function QuotaTable({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: QuotaRequestRow[]
  total: number
  page: number
  pageSize: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const items = useMemo(() => pageItems(page, pageCount), [page, pageCount])

  function navigate(nextPage: number, nextPageSize = pageSize) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(Math.max(1, Math.min(nextPage, Math.max(1, Math.ceil(total / nextPageSize))))))
    params.set('pageSize', String(nextPageSize))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Model</th>
              <th>Stream</th>
              <th>Tokens</th>
              <th>Rate / 1M</th>
              <th>Timing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className={styles.model}>
                    {row.modelDisplayName && row.modelDisplayName !== row.modelId ? (
                      <>
                        <strong>{row.modelDisplayName}</strong>
                        <code>{row.modelId}</code>
                      </>
                    ) : (
                      <code>{row.modelId}</code>
                    )}
                  </div>
                </td>
                <td>
                  {row.stream ? (
                    <div className={styles.stack}>
                      <strong className={styles.stream}>Stream</strong>
                      <span>{tokensPerSecond(row)}</span>
                    </div>
                  ) : (
                    <span className={styles.muted}>Non-stream</span>
                  )}
                </td>
                <td>
                  <div className={styles.stack}>
                    <strong className={styles.mono}>{formatTokens(row.inputTokens)} / {formatTokens(row.outputTokens)}</strong>
                    <span>Cache: {formatTokens(row.cachedInputTokens)}</span>
                  </div>
                </td>
                <td>
                  <div className={styles.stack}>
                    <strong className={styles.rate}>{ratePerMillion(row)}</strong>
                    <span>Request: {row.status === 'settled' ? formatCost(row.retailCostMicros) : '—'}</span>
                  </div>
                </td>
                <td>
                  <div className={`${styles.stack} ${styles.timing}`}>
                    <span><i aria-hidden="true" />First token {formatSeconds(elapsedMs(row.startedAt, row.firstTokenAt))}</span>
                    <span><i aria-hidden="true" />Duration {formatSeconds(elapsedMs(row.startedAt, row.completedAt))}</span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={5} className={styles.empty}>No API requests yet. Your usage will appear here.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination} aria-label="Quota pagination">
        <span>Total: <strong>{numberFormatter.format(total)}</strong></span>
        <label>
          Rows per page:
          <select value={pageSize} onChange={(event) => navigate(1, Number(event.target.value))}>
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className={styles.pageControls}>
          <button type="button" onClick={() => navigate(1)} disabled={page === 1} aria-label="First page">«</button>
          <button type="button" onClick={() => navigate(page - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
          {items.map((item, index) => item === 'ellipsis' ? (
            <span className={styles.ellipsis} key={`ellipsis-${index}`}>…</span>
          ) : (
            <button type="button" className={item === page ? styles.active : ''} onClick={() => navigate(item)} key={item} aria-current={item === page ? 'page' : undefined}>{item}</button>
          ))}
          <button type="button" onClick={() => navigate(page + 1)} disabled={page >= pageCount} aria-label="Next page">›</button>
          <button type="button" onClick={() => navigate(pageCount)} disabled={page >= pageCount} aria-label="Last page">»</button>
        </div>
      </div>
    </>
  )
}
