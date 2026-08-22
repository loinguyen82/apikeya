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

const TRANSFORMERS_ESM_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'
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

function decodeIds(tokenizer: Tokenizer, ids: number[]): string {
  try {
    return tokenizer.decode(ids, {
      skip_special_tokens: false,
      clean_up_tokenization_spaces: false,
    })
  } catch {
    return ''
  }
}

function markerDecodedToken(token: string): string {
  return token
    .replace(/^Ġ/, ' ')
    .replace(/^▁/, ' ')
    .replaceAll('Ċ', '\n')
    .replaceAll('ĉ', '\t')
}

function makePieces(tokenizer: Tokenizer, text: string, ids: number[], rawTokens: string[]): TokenPiece[] {
  const pieces = ids.map((id, index) => ({
    id,
    index,
    token: rawTokens[index] ?? String(id),
    text: '',
  }))

  let cursor = 0
  let pendingStart = 0

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]!
    const hasPending = pendingStart < index

    if (!hasPending) {
      const decoded = decodeIds(tokenizer, [piece.id])
      if (decoded && text.startsWith(decoded, cursor)) {
        piece.text = decoded
        cursor += decoded.length
        pendingStart = index + 1
        continue
      }

      const markerDecoded = markerDecodedToken(piece.token)
      if (markerDecoded && text.startsWith(markerDecoded, cursor)) {
        piece.text = markerDecoded
        cursor += markerDecoded.length
        pendingStart = index + 1
        continue
      }
    }

    // Some byte-level tokenizers split one Unicode code point across multiple
    // token IDs. Decode the unresolved group together before falling back.
    const grouped = decodeIds(tokenizer, ids.slice(pendingStart, index + 1))
    if (grouped && text.startsWith(grouped, cursor)) {
      piece.text = grouped
      cursor += grouped.length
      pendingStart = index + 1
    }
  }

  // Normal tokenizer decoding should consume the full source. If a tokenizer
  // normalizes text in a way that prevents exact reconstruction, preserve the
  // user's original text rather than rendering replacement characters.
  if (cursor < text.length && pieces.length > 0) {
    pieces[pieces.length - 1]!.text += text.slice(cursor)
  }

  return pieces
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
