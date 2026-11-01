/** Cooperative abort checks for tools (CC abortController.signal spirit). */

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const reason = signal.reason
    if (reason === 'sibling_error') {
      throw new Error('aborted')
    }
    if (reason === 'streaming_fallback') {
      throw new Error('aborted')
    }
    throw new Error('aborted')
  }
}

export function abortedResult(
  signal?: AbortSignal
): { ok: false; output: string } | null {
  if (!signal?.aborted) return null
  if (signal.reason === 'sibling_error') {
    return {
      ok: false,
      output: 'Cancelled: parallel tool call sibling errored'
    }
  }
  if (signal.reason === 'streaming_fallback') {
    return {
      ok: false,
      output: 'Error: Streaming fallback - tool execution discarded'
    }
  }
  return { ok: false, output: 'Tool execution aborted by user.' }
}
