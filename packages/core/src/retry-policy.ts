import type { RetryClass } from '@aiapi/contracts'

export interface FailureSignal {
  responseStarted: boolean
  streamStarted: boolean
  httpStatus?: number
  adapterDeclaredNoCharge?: boolean
  kind: 'preflight' | 'http' | 'timeout' | 'network' | 'parse' | 'unknown'
}

export function classifyRetry(signal: FailureSignal): RetryClass {
  if (signal.responseStarted || signal.streamStarted) return 'unsafe'
  if (signal.kind === 'preflight') return 'safe'
  if (signal.kind === 'http' && signal.adapterDeclaredNoCharge === true) return 'safe'
  // Timeouts, connection resets, fetch rejection and malformed responses may occur
  // after an upstream accepted the request. Conservative default: do not duplicate it.
  return 'unsafe'
}
