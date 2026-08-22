import Link from 'next/link'

export function BrandLogo({ href = '/', compact = false, gradientId = 'apivn-gradient' }: { href?: string; compact?: boolean; gradientId?: string }) {
  return (
    <Link href={href} className={`tide-brand ${compact ? 'tide-brand-compact' : ''}`} aria-label="APIVN.tech">
      <span className="tide-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 72 52" preserveAspectRatio="xMidYMid meet" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="7" y1="45" x2="65" y2="7" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1260D7" />
              <stop offset=".52" stopColor="#22D3EE" />
              <stop offset="1" stopColor="#2EE6B8" />
            </linearGradient>
            <linearGradient id={`${gradientId}-ribbon`} x1="27" y1="39" x2="48" y2="17" gradientUnits="userSpaceOnUse">
              <stop stopColor="#145CF4" />
              <stop offset=".5" stopColor="#0CC5E8" />
              <stop offset="1" stopColor="#15D7AE" />
            </linearGradient>
          </defs>
          <path d="M29.5 17.5A17.5 17.5 0 0 1 61 28.1" fill="none" stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round" />
          <path d="M24.8 25.8A12.8 12.8 0 1 0 16.7 48h40.8" fill="none" stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M27 42.5 38.3 21.9c1.2-2.2 4.2-2.2 5.4 0l11.5 20.6" fill="none" stroke={`url(#${gradientId}-ribbon)`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M30 42.3c7.5.1 11.3-8.4 18.5-7.4 3.2.4 5.8 2.5 7.5 5.3" fill="none" stroke={`url(#${gradientId})`} strokeWidth="4.2" strokeLinecap="round" />
          <circle cx="61" cy="48" r="4" fill="#07111f" stroke="#2EE6B8" strokeWidth="3" />
          <rect x="61" y="27" width="5.8" height="5.8" rx="1.5" fill="#18C7DB" />
          <rect x="66.5" y="34" width="3.8" height="3.8" rx="1" fill="#22DFAF" />
          <rect x="59" y="36" width="4.5" height="4.5" rx="1.2" fill="#138FF0" />
        </svg>
      </span>
      {!compact && <span className="tide-wordmark"><strong>apivn</strong><b>.tech</b></span>}
    </Link>
  )
}
