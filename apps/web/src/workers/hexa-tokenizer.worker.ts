/// <reference lib="webworker" />

export {}

type TokenizerModule = {
  AutoTokenizer: {
    from_pretrained: (
      repo: string,
      options?: { progress_callback?: (progress: unknown) => void },
    ) => Promise<Tokenizer>
  }
}

type Tokenizer = {
  encode: (text: string, options?: { add_special_tokens?: boolean }) => number[]
  tokenize: (text: string, options?: { add_special_tokens?: boolean }) => string[]
  decode: (
    ids: number[],
    options?: { skip_special_tokens?: boolean; clean_up_tokenization_spaces?: boolean },
  ) => string
}

type TokenizeRequest = {
  id: number
  type: 'tokenize'
  repo: string
  text: string
}

type WorkerStatus = 'loading' | 'tokenizing' | 'ready'

type TokenPiece = {
  id: number
  index: number
  token: string
  text: string
}

const TRANSFORMERS_ESM_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm'
const tokenizerCache = new Map<string, Promise<Tokenizer>>()
let modulePromise: Promise<TokenizerModule> | null = null

function postStatus(requestId: number, status: WorkerStatus) {
  self.postMessage({ type: 'status', requestId, status })
}

async function loadTransformers(): Promise<TokenizerModule> {
  modulePromise ??= import(/* webpackIgnore: true */ TRANSFORMERS_ESM_URL) as Promise<TokenizerModule>
  return modulePromise
}

async function loadTokenizer(repo: string, requestId: number): Promise<Tokenizer> {
  const cached = tokenizerCache.get(repo)
  if (cached) return cached

  postStatus(requestId, 'loading')
  const promise = loadTransformers().then(({ AutoTokenizer }) => AutoTokenizer.from_pretrained(repo, {
    progress_callback: () => postStatus(requestId, 'loading'),
  }))
  tokenizerCache.set(repo, promise)

  try {
    return await promise
  } catch (error) {
    tokenizerCache.delete(repo)
    throw error
  }
}

function makePieces(tokenizer: Tokenizer, text: string, ids: number[], rawTokens: string[]): TokenPiece[] {
  let cursor = 0

  return ids.map((id, index) => {
    const token = rawTokens[index] ?? String(id)
    let decoded = ''
    try {
      decoded = tokenizer.decode([id], {
        skip_special_tokens: false,
        clean_up_tokenization_spaces: false,
      })
    } catch {
      decoded = ''
    }

    if (decoded && text.startsWith(decoded, cursor)) {
      cursor += decoded.length
      return { id, index, token, text: decoded }
    }

    const markerDecoded = token
      .replace(/^Ġ/, ' ')
      .replace(/^▁/, ' ')
      .replaceAll('Ċ', '\n')
      .replaceAll('ĉ', '\t')

    if (markerDecoded && text.startsWith(markerDecoded, cursor)) {
      cursor += markerDecoded.length
      return { id, index, token, text: markerDecoded }
    }

    return { id, index, token, text: decoded || markerDecoded || token }
  })
}

self.onmessage = async (event: MessageEvent<TokenizeRequest>) => {
  const message = event.data
  if (!message || message.type !== 'tokenize') return

  const { id: requestId, repo, text } = message

  try {
    const tokenizer = await loadTokenizer(repo, requestId)
    postStatus(requestId, 'tokenizing')

    const ids = tokenizer.encode(text, { add_special_tokens: false })
    const rawTokens = tokenizer.tokenize(text, { add_special_tokens: false })
    const pieces = makePieces(tokenizer, text, ids, rawTokens)

    self.postMessage({
      type: 'result',
      requestId,
      repo,
      ids,
      pieces,
    })
    postStatus(requestId, 'ready')
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : 'Unable to load Hugging Face tokenizer.',
    })
  }
}
