import { abortedResult, throwIfAborted } from '../abortUtils.js'
import type { FileToolResult } from './types.js'

export function guardSignal(signal?: AbortSignal): FileToolResult | null {
  const early = abortedResult(signal)
  if (early) return early
  return null
}

export function checkSignal(signal?: AbortSignal): void {
  throwIfAborted(signal)
}
