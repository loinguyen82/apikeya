export interface NormalizedToolCall {
  id: string
  name: string
  arguments: string
  input: Record<string, unknown>
}

function argumentString(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

function argumentObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return { value: parsed }
  } catch {
    return { _raw: value }
  }
}

export function normalizeToolCalls(message: any, idSeed: string): NormalizedToolCall[] {
  const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  const calls = rawCalls.map((call: any, index: number) => {
    const args = argumentString(call?.function?.arguments)
    return {
      id: typeof call?.id === 'string' && call.id ? call.id : `call_${idSeed}_${index}`,
      name: typeof call?.function?.name === 'string' && call.function.name
        ? call.function.name
        : 'unknown_tool',
      arguments: args,
      input: argumentObject(args),
    }
  })

  if (calls.length === 0 && message?.function_call) {
    const args = argumentString(message.function_call.arguments)
    calls.push({
      id: `call_${idSeed}_0`,
      name: typeof message.function_call.name === 'string' && message.function_call.name
        ? message.function_call.name
        : 'unknown_tool',
      arguments: args,
      input: argumentObject(args),
    })
  }

  return calls
}
