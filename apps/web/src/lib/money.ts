export function formatVndFromMicros(micros: string | bigint | number | null | undefined): string {
  if (micros == null) return '0đ'
  const vnd = Number(BigInt(micros) / 1000n)
  return new Intl.NumberFormat('vi-VN').format(vnd) + 'đ'
}

export function formatVnd(vnd: number | null | undefined): string {
  if (vnd == null) return '0đ'
  return new Intl.NumberFormat('vi-VN').format(vnd) + 'đ'
}

export function formatCreditFromMicros(micros: string | bigint | number | null | undefined): string {
  if (micros == null) return '0 Credit'
  const credit = Number(micros) / 1_000_000
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(credit)} Credit`
}

export function formatCreditFromVnd(vnd: number | null | undefined): string {
  if (vnd == null) return '0 Credit'
  return formatCreditFromMicros(BigInt(Math.round(vnd)) * 1000n)
}

export function formatCarrotFromMicros(micros: string | bigint | number | null | undefined): string {
  if (micros == null) return '0 🥕'
  const carrots = Number(BigInt(micros)) / 1_000_000
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(carrots)} 🥕`
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '0'
  return new Intl.NumberFormat('vi-VN').format(num)
}
