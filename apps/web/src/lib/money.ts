export function formatVndFromMicros(micros: string | bigint | number | null | undefined): string {
  if (micros == null) return '0đ'
  const vnd = Number(BigInt(micros) / 1000n)
  return new Intl.NumberFormat('vi-VN').format(vnd) + 'đ'
}

export function formatVnd(vnd: number | null | undefined): string {
  if (vnd == null) return '0đ'
  return new Intl.NumberFormat('vi-VN').format(vnd) + 'đ'
}

function creditFromMicros(micros: string | bigint | number | null | undefined): number {
  if (micros == null) return 0
  return Number(BigInt(micros)) / 1_000_000
}

export function formatCreditFromMicros(micros: string | bigint | number | null | undefined): string {
  const credit = creditFromMicros(micros)
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(credit)} Credit`
}

export function formatCreditUsageFromMicros(micros: string | bigint | number | null | undefined): string {
  const credit = creditFromMicros(micros)
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(credit)} Credit`
}

export function formatCreditRateFromMicros(micros: string | bigint | number | null | undefined): string {
  return formatCreditUsageFromMicros(micros)
}

export function formatCreditFromVnd(vnd: number | null | undefined): string {
  if (vnd == null) return '0 Credit'
  return formatCreditFromMicros(BigInt(Math.round(vnd)) * 1000n)
}

/** @deprecated Use formatCreditUsageFromMicros. Kept temporarily for legacy imports. */
export function formatCarrotFromMicros(micros: string | bigint | number | null | undefined): string {
  return formatCreditUsageFromMicros(micros)
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '0'
  return new Intl.NumberFormat('vi-VN').format(num)
}
