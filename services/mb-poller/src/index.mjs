import { createHash, createHmac, createRequire } from 'node:crypto'
import { existsSync } from 'node:fs'
import process from 'node:process'

const require = createRequire(import.meta.url)
const { MB } = require('mbbank')

if (typeof process.loadEnvFile === 'function' && existsSync('.env')) {
  process.loadEnvFile('.env')
}

const MIN_BANK_POLL_MS = 60_000
const MIN_STATE_CHECK_MS = 10_000
const MAX_SEEN_EXTERNAL_IDS = 5_000
const PAYMENT_CODE_PATTERN = /APV[A-Z0-9]{8,12}/i
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function boundedInterval(name, fallback, minimum) {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(minimum, Math.floor(raw))
}

const config = {
  username: requiredEnv('MB_USERNAME'),
  password: requiredEnv('MB_PASSWORD'),
  accountNumber: requiredEnv('MB_ACCOUNT_NUMBER'),
  ocrMethod: process.env.MB_OCR_METHOD?.trim() || 'default',
  appBaseUrl: requiredEnv('APIVN_BASE_URL').replace(/\/+$/, ''),
  secret: requiredEnv('BANK_POLLER_SECRET'),
  pollIntervalMs: boundedInterval('POLL_INTERVAL_MS', 60_000, MIN_BANK_POLL_MS),
  stateCheckIntervalMs: boundedInterval('STATE_CHECK_INTERVAL_MS', 15_000, MIN_STATE_CHECK_MS),
}

if (!['default', 'tesseract'].includes(config.ocrMethod)) {
  throw new Error('MB_OCR_METHOD must be default or tesseract')
}

let mbClient = null
let shuttingDown = false
let lastBankPollAt = 0
let hadPollingDemand = false
const seenExternalIds = new Map()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rememberExternalId(externalId) {
  seenExternalIds.delete(externalId)
  seenExternalIds.set(externalId, Date.now())
  while (seenExternalIds.size > MAX_SEEN_EXTERNAL_IDS) {
    const oldest = seenExternalIds.keys().next().value
    if (!oldest) break
    seenExternalIds.delete(oldest)
  }
}

function formatIctDate(offsetDays = 0) {
  const shifted = new Date(Date.now() + ICT_OFFSET_MS)
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays)
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${shifted.getUTCFullYear()}`
}

function parseMbAmount(value) {
  if (value === null || value === undefined) return 0
  const raw = String(value).trim().replace(/\s+/g, '')
  if (!raw || raw === '0') return 0

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const parsed = Number(raw)
    return Number.isSafeInteger(parsed) ? parsed : Math.round(parsed)
  }
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/,/g, ''))
    return Number.isSafeInteger(parsed) ? parsed : Math.round(parsed)
  }
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'))
    return Number.isSafeInteger(parsed) ? parsed : Math.round(parsed)
  }

  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  const parsed = Number(digits)
  return Number.isSafeInteger(parsed) ? parsed : 0
}

function parseMbDate(value) {
  if (!value) return null
  const raw = String(value).trim()

  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (dmy) {
    const [, dd, mm, yyyy, hh = '0', min = '0', sec = '0'] = dmy
    const year = Number(yyyy)
    const month = Number(mm)
    const day = Number(dd)
    const hour = Number(hh)
    const minute = Number(min)
    const second = Number(sec)
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
    const validation = new Date(localAsUtc)
    if (
      validation.getUTCFullYear() !== year ||
      validation.getUTCMonth() !== month - 1 ||
      validation.getUTCDate() !== day ||
      validation.getUTCHours() !== hour ||
      validation.getUTCMinutes() !== minute
    ) return null
    return new Date(localAsUtc - ICT_OFFSET_MS).toISOString()
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (ymd) {
    const [, yyyy, mm, dd, hh, min, sec = '0'] = ymd
    const localAsUtc = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(sec))
    return new Date(localAsUtc - ICT_OFFSET_MS).toISOString()
  }

  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function stableExternalId(tx, amount, description) {
  const refNo = String(tx.refNo ?? '').trim()
  if (refNo) return refNo
  return `sha256:${createHash('sha256')
    .update([
      config.accountNumber,
      String(tx.transactionDate ?? ''),
      String(tx.postDate ?? ''),
      String(amount),
      description,
    ].join('|'))
    .digest('hex')}`
}

function getMbClient() {
  if (!mbClient) {
    mbClient = new MB({
      username: config.username,
      password: config.password,
      preferredOCRMethod: config.ocrMethod,
      saveWasm: true,
    })
  }
  return mbClient
}

async function disposeMbClient() {
  const current = mbClient
  mbClient = null
  if (current?.client?.close) {
    try { await current.client.close() } catch { /* best effort */ }
  }
}

async function getPollerState() {
  const response = await fetch(`${config.appBaseUrl}/api/internal/bank-poller/state`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-bank-poller-secret': config.secret,
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(`poller state request failed with HTTP ${response.status}`)
  }
  const state = await response.json()
  return {
    shouldPoll: state?.should_poll === true,
    activePending: Number(state?.active_pending ?? 0),
    gracePending: Number(state?.grace_pending ?? 0),
  }
}

async function postBankEvent(event) {
  const body = JSON.stringify(event)
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', config.secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  const response = await fetch(`${config.appBaseUrl}/api/internal/bank-events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bank-timestamp': timestamp,
      'x-bank-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(20_000),
  })

  if (!response.ok) {
    throw new Error(`bank event delivery failed with HTTP ${response.status}`)
  }
  return response.json()
}

async function pollBankHistory(reason) {
  const startedAt = Date.now()
  lastBankPollAt = startedAt
  console.log(`[mb-poller] bank history check started reason=${reason}`)

  try {
    const client = getMbClient()
    const transactions = await client.getTransactionsHistory({
      accountNumber: config.accountNumber,
      fromDate: formatIctDate(-1),
      toDate: formatIctDate(0),
    }) ?? []

    let candidates = 0
    let delivered = 0
    for (const tx of transactions) {
      const amount = parseMbAmount(tx.creditAmount)
      if (amount <= 0) continue

      const description = String(tx.transactionDesc ?? '').trim()
      const paymentCode = description.toUpperCase().match(PAYMENT_CODE_PATTERN)?.[0]
      if (!paymentCode) continue

      const occurredAt = parseMbDate(tx.transactionDate) ?? parseMbDate(tx.postDate)
      if (!occurredAt) {
        console.warn('[mb-poller] skipped a coded transaction with unparseable bank date')
        continue
      }

      const externalId = stableExternalId(tx, amount, description)
      candidates += 1
      if (seenExternalIds.has(externalId)) continue

      await postBankEvent({
        bank: 'mb',
        external_id: externalId,
        amount_vnd: amount,
        description,
        occurred_at: occurredAt,
        raw: {
          post_date: String(tx.postDate ?? ''),
          transaction_currency: String(tx.transactionCurrency ?? 'VND'),
          type: String(tx.type ?? ''),
        },
      })
      rememberExternalId(externalId)
      delivered += 1
    }

    console.log(`[mb-poller] bank history check complete candidates=${candidates} delivered=${delivered}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(`[mb-poller] bank history check failed: ${message}`)
    await disposeMbClient()
  }
}

async function maybePoll(reason) {
  if (Date.now() - lastBankPollAt < config.pollIntervalMs) return false
  await pollBankHistory(reason)
  return true
}

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[mb-poller] shutting down signal=${signal}`)
  await disposeMbClient()
  process.exit(0)
}

process.once('SIGINT', () => { void shutdown('SIGINT') })
process.once('SIGTERM', () => { void shutdown('SIGTERM') })

async function main() {
  console.log(`[mb-poller] starting bank_poll_ms=${config.pollIntervalMs} state_check_ms=${config.stateCheckIntervalMs}`)
  console.log('[mb-poller] MB credentials are loaded; sensitive values will not be printed')

  // One recovery scan on boot makes restarts safe. Database uniqueness is the
  // source of truth, so replaying already-seen transactions cannot double-credit.
  await pollBankHistory('startup-recovery')

  while (!shuttingDown) {
    try {
      const state = await getPollerState()

      if (state.shouldPoll) {
        await maybePoll(state.activePending > 0 ? 'pending-topup' : 'expiry-grace')
      } else if (hadPollingDemand) {
        // A final overlap scan after the last active/grace order disappears.
        // The 60-second floor still applies.
        await maybePoll('final-overlap')
      }

      hadPollingDemand = state.shouldPoll
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.error(`[mb-poller] state check failed: ${message}`)
      // Fail closed: if APIVN state cannot be read, do not hammer MB blindly.
    }

    await sleep(config.stateCheckIntervalMs)
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : 'unknown fatal error'
  console.error(`[mb-poller] fatal: ${message}`)
  await disposeMbClient()
  process.exit(1)
})
