import type {
  HexaAnalysis,
  HexaConversationInput,
  HexaConversationAnalysis,
  HexaCountInput,
  HexaMessage,
  HexaMessageCount,
  ModelCatalogItem,
  TokenCountAccuracy,
  TokenCountResult,
} from '@aiapi/contracts'

export type LocalHexaModel = Pick<ModelCatalogItem, 'id' | 'displayName' | 'contextWindowTokens' | 'tokenizerFamily'>

export const MAX_LOCAL_HEXA_INPUT_BYTES = 1_000_000

const OPENAI_MESSAGE_FRAMING_TOKENS = 3
const OPENAI_REPLY_PRIMER_TOKENS = 3

type O200kTokenizer = Pick<
  typeof import('gpt-tokenizer/encoding/o200k_base'),
  'countTokens' | 'setMergeCacheSize'
>

type LocalCounter = {
  accuracy: TokenCountAccuracy
  countText: (text: string) => number
}

let o200kTokenizerPromise: Promise<O200kTokenizer> | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stableHexaJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) return `[${value.map(stableHexaJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableHexaJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(String(value))
}

export function assertLocalHexaInputSize(raw: string): void {
  if (new TextEncoder().encode(raw).byteLength > MAX_LOCAL_HEXA_INPUT_BYTES) {
    throw new Error('Input is too large to analyze locally.')
  }
}

function estimateTokens(value: unknown): number {
  const serialized = typeof value === 'string' ? value : stableHexaJson(value)
  if (!serialized) return 0
  return Math.max(1, Math.ceil(new TextEncoder().encode(serialized).byteLength / 4))
}

async function loadO200kTokenizer(): Promise<O200kTokenizer> {
  o200kTokenizerPromise ??= import('gpt-tokenizer/encoding/o200k_base').then((tokenizer) => {
    // The merge cache can retain text-derived fragments. This playground keeps
    // tokenization local and does not retain that derived prompt data either.
    tokenizer.setMergeCacheSize(0)
    return tokenizer
  })
  return o200kTokenizerPromise
}

async function localCounterFor(model: LocalHexaModel): Promise<LocalCounter> {
  if (model.tokenizerFamily === 'openai_o200k_compatible') {
    const tokenizer = await loadO200kTokenizer()
    return {
      accuracy: 'compatible_tokenizer',
      countText: (text) => tokenizer.countTokens(text, { allowedSpecial: 'all' }),
    }
  }

  return { accuracy: 'estimated', countText: (text) => estimateTokens(text) }
}

function textStats(text: string): { characters: number; words: number } {
  const words = text.trim().match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)
  return { characters: Array.from(text).length, words: words?.length ?? 0 }
}

function payloadForCounting(input: HexaConversationInput): Record<string, unknown> {
  const { type: _type, ...payload } = input
  return payload
}

function categoryForRole(role: string): 'system' | 'user' | 'assistant' | 'tool' | 'other' {
  switch (role.trim().toLowerCase()) {
    case 'system': return 'system'
    case 'user': return 'user'
    case 'assistant': return 'assistant'
    case 'tool': return 'tool'
    default: return 'other'
  }
}

function roleLabel(role: string, number: number): string {
  const label = categoryForRole(role)
  return `${label === 'system' ? 'System' : label === 'user' ? 'User' : label === 'assistant' ? 'Assistant' : label === 'tool' ? 'Tool' : role || 'Other'} #${number}`
}

function isTextOnlyOpenAiRequest(request: Record<string, unknown>): boolean {
  if (!Array.isArray(request.messages) || !request.messages.every(isRecord)) return false
  if (request.system !== undefined && typeof request.system !== 'string') return false
  return request.messages.every((message) => (
    typeof message.role === 'string'
    && (message.content === undefined || typeof message.content === 'string')
  ))
}

function countCompatibleValue(counter: LocalCounter, value: unknown): number {
  return counter.countText(typeof value === 'string' ? value : stableHexaJson(value))
}

function compatibleMessageTokens(counter: LocalCounter, message: Record<string, unknown>): number {
  const { role, ...body } = message
  if (typeof role !== 'string' || role.trim().length === 0) return 0
  const bodyTokens = Object.keys(body).length > 0 ? countCompatibleValue(counter, body) : 0
  return countCompatibleValue(counter, role) + bodyTokens + OPENAI_MESSAGE_FRAMING_TOKENS
}

function countCompatibleRequest(counter: LocalCounter, request: Record<string, unknown>): number | null {
  if (!isTextOnlyOpenAiRequest(request)) return null
  const messages = request.messages as Array<Record<string, unknown>>
  let total = 0

  if (request.system !== undefined) total += compatibleMessageTokens(counter, { role: 'system', content: request.system })
  for (const message of messages) total += compatibleMessageTokens(counter, message)
  if (request.tools !== undefined) total += countCompatibleValue(counter, request.tools)
  if (request.functions !== undefined) total += countCompatibleValue(counter, request.functions)

  const other = Object.fromEntries(
    Object.entries(request).filter(([key]) => !['messages', 'system', 'tools', 'functions'].includes(key)),
  )
  if (Object.keys(other).length > 0) total += countCompatibleValue(counter, other)
  return total + OPENAI_REPLY_PRIMER_TOKENS
}

function countEstimatedRequest(request: Record<string, unknown>): number {
  if (!Array.isArray(request.messages) || !request.messages.every(isRecord)) return estimateTokens(request)
  let total = 0
  if (request.system !== undefined) total += estimateTokens(request.system)
  for (const message of request.messages) total += estimateTokens(message)
  if (request.tools !== undefined) total += estimateTokens(request.tools)
  if (request.functions !== undefined) total += estimateTokens(request.functions)
  const other = Object.fromEntries(
    Object.entries(request).filter(([key]) => !['messages', 'system', 'tools', 'functions'].includes(key)),
  )
  if (Object.keys(other).length > 0) total += estimateTokens(other)
  return total
}

function countRequest(model: LocalHexaModel, counter: LocalCounter, request: Record<string, unknown>): TokenCountResult {
  const compatibleTokens = counter.accuracy === 'compatible_tokenizer'
    ? countCompatibleRequest(counter, request)
    : null
  return {
    tokens: compatibleTokens ?? countEstimatedRequest(request),
    accuracy: compatibleTokens == null ? 'estimated' : 'compatible_tokenizer',
    provider: 'local',
    model: model.id,
  }
}

function countAnalysisValue(counter: LocalCounter, value: unknown, compatibleProtocol: boolean): number {
  return compatibleProtocol ? countCompatibleValue(counter, value) : estimateTokens(value)
}

function messageTokensForAnalysis(counter: LocalCounter, message: HexaMessage, compatibleProtocol: boolean): number {
  if (!compatibleProtocol) return estimateTokens(message)
  return compatibleMessageTokens(counter, message)
}

function outputForTurn(messageCounts: HexaMessageCount[], messages: HexaMessage[], userIndex: number): number | null {
  let outputTokens = 0
  let hasAssistantOutput = false
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    if (messages[index]?.role.trim().toLowerCase() === 'user') break
    if (messages[index]?.role.trim().toLowerCase() === 'assistant') {
      hasAssistantOutput = true
      outputTokens += messageCounts[index]?.tokens ?? 0
    }
  }
  return hasAssistantOutput ? outputTokens : null
}

function analyzeConversation(
  model: LocalHexaModel,
  counter: LocalCounter,
  input: HexaConversationInput,
): { count: TokenCountResult; analysis: HexaConversationAnalysis } {
  const messages = input.messages
  const latestUserIndex = messages.reduce(
    (latest, message, index) => categoryForRole(message.role) === 'user' ? index : latest,
    -1,
  )
  const currentInput: HexaConversationInput = {
    ...input,
    messages: latestUserIndex >= 0 ? messages.slice(0, latestUserIndex + 1) : messages,
  }
  const compatibleProtocol = counter.accuracy === 'compatible_tokenizer'
    && isTextOnlyOpenAiRequest(payloadForCounting(currentInput))
  const messageCounts = messages.map((message, index) => ({
    index,
    role: message.role,
    label: roleLabel(message.role, index + 1),
    tokens: messageTokensForAnalysis(counter, message, compatibleProtocol),
  }))

  const systemFromTopLevel = input.system === undefined
    ? 0
    : compatibleProtocol
    ? compatibleMessageTokens(counter, { role: 'system', content: input.system })
    : estimateTokens(input.system)
  let toolDefinitions = 0
  if (input.tools !== undefined) toolDefinitions += countAnalysisValue(counter, input.tools, compatibleProtocol)
  if (input.functions !== undefined) toolDefinitions += countAnalysisValue(counter, input.functions, compatibleProtocol)
  const topLevelOther = Object.fromEntries(
    Object.entries(payloadForCounting(input)).filter(([key]) => !['messages', 'system', 'tools', 'functions'].includes(key)),
  )
  const otherTopLevel = Object.keys(topLevelOther).length > 0
    ? countAnalysisValue(counter, topLevelOther, compatibleProtocol)
    : 0

  let systemTokens = systemFromTopLevel
  let historyTokens = 0
  let currentMessageTokens = 0
  let toolTokens = toolDefinitions
  let otherTokens = otherTopLevel

  messageCounts.slice(0, currentInput.messages.length).forEach((message, index) => {
    switch (categoryForRole(message.role)) {
      case 'system': systemTokens += message.tokens; break
      case 'user':
        if (index === latestUserIndex) currentMessageTokens += message.tokens
        else historyTokens += message.tokens
        break
      case 'assistant':
        if (index < latestUserIndex) historyTokens += message.tokens
        else otherTokens += message.tokens
        break
      case 'tool': toolTokens += message.tokens; break
      case 'other': otherTokens += message.tokens; break
    }
  })

  const total = countRequest(model, counter, payloadForCounting(currentInput))
  const visibleComponents = systemTokens + historyTokens + currentMessageTokens + toolTokens + otherTokens
  const normalizedTotalTokens = Math.max(total.tokens, visibleComponents)
  const protocolDeltaTokens = normalizedTotalTokens - visibleComponents
  const normalizedTotal = { ...total, tokens: normalizedTotalTokens }

  const growth = messageCounts.flatMap((message) => {
    if (categoryForRole(message.role) !== 'user') return []
    const snapshot: HexaConversationInput = { ...input, messages: messages.slice(0, message.index + 1) }
    return [{
      turn: messageCounts.slice(0, message.index + 1).filter((candidate) => categoryForRole(candidate.role) === 'user').length,
      inputTokens: countRequest(model, counter, payloadForCounting(snapshot)).tokens,
      outputTokens: outputForTurn(messageCounts, messages, message.index),
    }]
  })
  const cumulativeInputTokens = growth.reduce((sum, point) => sum + point.inputTokens, 0)
  const currentContextTokens = growth.at(-1)?.inputTokens ?? normalizedTotal.tokens

  return {
    count: {
      ...normalizedTotal,
      details: {
        systemTokens,
        historyTokens,
        currentMessageTokens,
        toolTokens,
        otherTokens,
        overheadTokens: protocolDeltaTokens,
      },
    },
    analysis: {
      messageCounts,
      breakdown: { systemTokens, historyTokens, currentMessageTokens, toolTokens, otherTokens, protocolDeltaTokens },
      currentContextTokens,
      cumulativeInputTokens,
      newContentTokens: currentContextTokens,
      reReadContextTokens: Math.max(0, cumulativeInputTokens - currentContextTokens),
      historyTax: normalizedTotal.tokens > 0 && historyTokens > 0 ? historyTokens / normalizedTotal.tokens : null,
      contextAmplification: currentMessageTokens > 0 ? normalizedTotal.tokens / currentMessageTokens : null,
      growth,
    },
  }
}

export async function analyzeLocalHexaInput(model: LocalHexaModel, input: HexaCountInput): Promise<HexaAnalysis> {
  const counter = await localCounterFor(model)
  if (input.type === 'text') {
    assertLocalHexaInputSize(input.text)
    return {
      model: model.id,
      provider: 'local',
      count: {
        tokens: counter.countText(input.text),
        accuracy: counter.accuracy,
        provider: 'local',
        model: model.id,
      },
      text: textStats(input.text),
      contextWindowTokens: model.contextWindowTokens ?? null,
    }
  }

  assertLocalHexaInputSize(stableHexaJson(input))
  const conversation = analyzeConversation(model, counter, input)
  return {
    model: model.id,
    provider: 'local',
    count: conversation.count,
    conversation: conversation.analysis,
    contextWindowTokens: model.contextWindowTokens ?? null,
  }
}
