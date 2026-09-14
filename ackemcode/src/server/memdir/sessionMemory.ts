/**
 * R4-SESSMEM · Session memory (CC services/SessionMemory spirit).
 *
 * Maintains an incremental markdown summary of the CURRENT session at
 * ~/.ackemcode/sessions/{sessionId}/summary.md so that:
 *  - compact can prune history by replacing the head with this summary
 *    (SM-compact) without an LLM summarization call, and
 *  - a resumed session re-injects "what was I doing" context at the head.
 *
 * Boundary (contract 5): sessionMemory covers the in-flight session only;
 * memdir extract owns cross-session topic memory. Neither replaces the other.
 * All IO is fail-soft — a broken disk never breaks the loop.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ChatMessage } from '../../shared/types.js'
import { buildExtractiveSummary } from '../agent/compact/summarize.js'
import { estimateMessagesTokens } from '../agent/compact/estimate.js'

/** Update cadence: every N turns … */
export const SESSION_MEMORY_TURN_INTERVAL = 5
/** … or when the transcript grew by this many tokens since the last update. */
export const SESSION_MEMORY_TOKEN_DELTA = 20_000

export function sessionMemoryDir(sessionId: string): string {
  return path.join(os.homedir(), '.ackemcode', 'sessions', sessionId)
}

export function sessionMemoryPath(sessionId: string): string {
  return path.join(sessionMemoryDir(sessionId), 'summary.md')
}

export function isSessionMemoryEnabled(): boolean {
  return process.env.ACKEM_DISABLE_SESSION_MEMORY !== '1'
}

export type SessionMemoryState = {
  sessionId: string
  /** Turn count at last successful update. */
  lastUpdateTurns: number
  /** Estimated transcript tokens at last successful update. */
  lastUpdateTokens: number
  /** In-memory copy of the latest summary (null until first load/update). */
  summary: string | null
  /** Pending background update (dedupe concurrent updates). */
  updating: boolean
}

export function createSessionMemoryState(sessionId: string): SessionMemoryState {
  return {
    sessionId,
    lastUpdateTurns: 0,
    lastUpdateTokens: 0,
    summary: null,
    updating: false
  }
}

/** Contract 1 cadence: every N turns or +tokenDelta since last update. */
export function shouldUpdateSessionMemory(
  state: SessionMemoryState,
  turns: number,
  tokens: number
): boolean {
  if (!isSessionMemoryEnabled()) return false
  if (state.updating) return false
  if (turns - state.lastUpdateTurns >= SESSION_MEMORY_TURN_INTERVAL) return true
  if (tokens - state.lastUpdateTokens >= SESSION_MEMORY_TOKEN_DELTA) return true
  return false
}

/**
 * Contract 1: incremental background update. Builds the nine-section extractive
 * summary over the transcript and persists it. Never throws.
 */
export async function updateSessionMemory(
  state: SessionMemoryState,
  messages: ChatMessage[],
  turns: number
): Promise<boolean> {
  if (!isSessionMemoryEnabled()) return false
  state.updating = true
  try {
    const body = buildExtractiveSummary(messages.filter((m) => m.role !== 'system'))
    const header = [
      '<!-- ackem session memory (auto-generated; do not edit) -->',
      `<!-- sessionId: ${state.sessionId} · updatedAt: ${new Date().toISOString()} · turns: ${turns} -->`,
      ''
    ].join('\n')
    await mkdir(sessionMemoryDir(state.sessionId), { recursive: true })
    await writeFile(sessionMemoryPath(state.sessionId), header + body, 'utf8')
    state.summary = body
    state.lastUpdateTurns = turns
    state.lastUpdateTokens = estimateMessagesTokens(messages)
    return true
  } catch {
    return false // fail-soft
  } finally {
    state.updating = false
  }
}

/** Contract 4: load a persisted summary (resume). Null when absent/disabled. */
export async function loadSessionMemory(sessionId: string): Promise<string | null> {
  if (!isSessionMemoryEnabled()) return null
  try {
    const raw = await readFile(sessionMemoryPath(sessionId), 'utf8')
    // Strip metadata comment lines
    const body = raw.replace(/^<!--[\s\S]*?-->\n?/gm, '').trim()
    return body || null
  } catch {
    return null
  }
}

/** Contract 4: the resume injection message for the context head. */
export function formatSessionMemoryResume(summary: string): string {
  return [
    '[Session memory] You are resuming a previous session. Summary of where it left off:',
    '',
    summary.trim(),
    '',
    'Continue from the Next Step above unless the user redirects you.'
  ].join('\n')
}
