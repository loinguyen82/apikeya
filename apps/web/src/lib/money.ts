export function formatVndFromMicros(micros: string | bigint | number | null | undefined): string {
  if (micros == null) return '0đ'
  const vnd = Number(BigInt(micros) / 1000n)
  return new Intl.NumberFormat('vi-VN').format(vnd) + 'đ'
}

export function formatVnd(vnd: number | null | undefined): string {
  if (vnd == null) return '0đ'
  return new Intl.NumberFormat('vi-VN').format(vnd) + 'đ'
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '0'
  return new Intl.NumberFormat('vi-VN').format(num)
}
