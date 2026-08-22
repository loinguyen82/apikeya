import Link from 'next/link'

export function BrandLogo({ href = '/', compact = false, gradientId = 'apivn-gradient' }: { href?: string; compact?: boolean; gradientId?: string }) {
  return (
    <Link href={href} className={`tide-brand ${compact ? 'tide-brand-compact' : ''}`} aria-label="APIVN.tech">
      <span className="tide-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <defs>
            <linearGradient id={gradientId} x1="4" y1="42" x2="44" y2="6" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1260D7" />
              <stop offset=".52" stopColor="#22D3EE" />
              <stop offset="1" stopColor="#2EE6B8" />
            </linearGradient>
          </defs>
          <path d="M9 33.5c-3.4-1-5.8-4.1-5.8-7.7 0-4.4 3.6-8 8-8 .8 0 1.6.1 2.3.3C15.2 12.3 20.5 8 26.8 8c7.7 0 14 6.3 14 14v.7a6.2 6.2 0 0 1-1 12.3H10.2" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.5 34 25 17.5 34.5 34M20.1 27.1h9.8" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="41.5" cy="35" r="2.2" fill="#2EE6B8" />
        </svg>
      </span>
      {!compact && <span className="tide-wordmark"><strong>apivn</strong><b>.tech</b></span>}
    </Link>
  )
}
