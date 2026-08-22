'use client'

import { useState } from 'react'
import { TideIcon } from './TideIcon'

export function CopyButton({ value, label = 'Sao chép', compact = false }: { value: string; label?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" className={`tide-copy ${compact ? 'compact' : ''}`} onClick={copy} aria-label={copied ? 'Đã sao chép' : label}>
      <TideIcon name={copied ? 'check' : 'copy'} />
      {!compact && <span>{copied ? 'Đã sao chép' : label}</span>}
    </button>
  )
}
