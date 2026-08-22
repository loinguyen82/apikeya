import type { ReactNode } from 'react'
import styles from './TokenizedBackdrop.module.css'

const TOKEN_ROWS = [
  ['create', ' intelligent', ' APIs', ' with', ' Hexa', ' {', ' model', ':', ' GPT', ' }'],
  ['model', ' routing', ' usage', ' credits', ' tokens', ' /', ' v1', ' POST', ' 200'],
  ['GPT', ' Claude', ' Kimi', ' DeepSeek', ' GLM', ' OpenAI', ' Anthropic'],
  ['request', ' response', ' context', ' streaming', ' stream=true', ' JSON'],
  ['SDK', ' chat', ' completion', ' embedding', ' provider', ' latency', ' route'],
  ['{', ' "model"', ':', ' "claude"', ',', ' "stream"', ':', ' true', ' }'],
  ['token', ' input', ' output', ' cached', ' reasoning', ' total', ' usage'],
  ['POST', ' /v1/chat/completions', ' 200', ' response', ' credits', ' latency'],
  ['AI', ' API', ' model', ' context', ' provider', ' request', ' response'],
  ['[', ' system', ',', ' user', ',', ' assistant', ']', ' tokens', ' Hexa'],
] as const

const TOKEN_TONES = [
  styles.blue,
  styles.violet,
  styles.cyan,
  styles.emerald,
  styles.amber,
  styles.rose,
]

const ROW_DEPTH = [styles.rowA, styles.rowB, styles.rowC, styles.rowD]

export function TokenizedBackdrop({ children }: { children: ReactNode }) {
  return (
    <section className={styles.stage}>
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.field}>
          {TOKEN_ROWS.map((row, rowIndex) => (
            <div className={`${styles.row} ${ROW_DEPTH[rowIndex % ROW_DEPTH.length]}`} key={`token-row-${rowIndex}`}>
              {row.map((token, tokenIndex) => (
                <span
                  className={`${styles.token} ${TOKEN_TONES[(rowIndex * 3 + tokenIndex) % TOKEN_TONES.length]}`}
                  key={`token-${rowIndex}-${tokenIndex}`}
                >
                  {token}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.content}>{children}</div>
    </section>
  )
}
