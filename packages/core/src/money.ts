export const MICROS_PER_VND = 1000n
export const TOKENS_PER_MILLION = 1_000_000n

export function asBigInt(value: string | number | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value)
}

export function vndToMicros(vnd: number): bigint {
  if (!Number.isSafeInteger(vnd) || vnd < 0) throw new Error('VND must be a non-negative safe integer')
  return BigInt(vnd) * MICROS_PER_VND
}

export function microsToDisplayVnd(micros: bigint): number {
  return Number(micros / MICROS_PER_VND)
}

export function ceilDiv(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error('divisor must be positive')
  return (n + d - 1n) / d
}
