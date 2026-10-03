import type { MemoryControlCommand, MemoryTarget } from '../contracts.js'

export type ControlIntentResolution =
  | { status: 'none' }
  | { status: 'ambiguous'; message: string; candidateTargets: MemoryTarget[]; requiresConfirmation: true }
  | { status: 'ready'; command: MemoryControlCommand }

const CORRECT_RE = /纠正|记错了|应该是|改成|不对，?应该是/
const FORGET_RE = /忘了|忘记|别再提|不要记住|忘掉/
const MUTE_RE = /别提|不用说|敏感话题|先别聊/
const DELETE_RE = /删除记忆|删掉这条|从记忆里去掉/

function extractCorrectedSummary(text: string): string {
  const patterns = [
    /(?:纠正|记错了)[：:为]?\s*(.+)/,
    /改成[：:]?\s*(.+)/,
    /应该是[：:]?\s*(.+)/,
    /不对，?应该是[：:]?\s*(.+)/
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return text.trim()
}

/** Map natural-language control utterances to the four-type contract (IPC + SelfEditor). */
export function resolveMemoryControlIntent(
  text: string,
  ctx: { sessionId: string; timezone?: string; turnId?: string | null },
  topicMatches: MemoryTarget[]
): ControlIntentResolution {
  const t = text.trim()
  if (!t) return { status: 'none' }

  if (CORRECT_RE.test(t)) {
    if (topicMatches.length > 1) {
      return {
        status: 'ambiguous',
        requiresConfirmation: true,
        message: '有多条相关记忆，请确认要纠正哪一条。',
        candidateTargets: topicMatches
      }
    }
    const target = topicMatches[0] ?? { kind: 'topic', text: t }
    return {
      status: 'ready',
      command: {
        kind: 'correct',
        target,
        replacement: { summary: extractCorrectedSummary(t) },
        sessionId: ctx.sessionId,
        timezone: ctx.timezone,
        turnId: ctx.turnId
      }
    }
  }

  if (FORGET_RE.test(t)) {
    if (topicMatches.length > 1) {
      return {
        status: 'ambiguous',
        requiresConfirmation: true,
        message: '有多条相关记忆，请确认要忘记哪一条。',
        candidateTargets: topicMatches
      }
    }
    const target = topicMatches[0] ?? { kind: 'topic', text: t }
    return {
      status: 'ready',
      command: {
        kind: 'forget',
        target,
        sessionId: ctx.sessionId,
        timezone: ctx.timezone,
        turnId: ctx.turnId
      }
    }
  }

  if (MUTE_RE.test(t)) {
    if (topicMatches.length > 1) {
      return {
        status: 'ambiguous',
        requiresConfirmation: true,
        message: '有多条相关记忆，请确认要静音哪一条。',
        candidateTargets: topicMatches
      }
    }
    const target = topicMatches[0] ?? { kind: 'topic', text: t }
    return {
      status: 'ready',
      command: {
        kind: 'mute',
        target,
        sessionId: ctx.sessionId,
        timezone: ctx.timezone,
        turnId: ctx.turnId
      }
    }
  }

  if (DELETE_RE.test(t)) {
    if (topicMatches.length > 1) {
      return {
        status: 'ambiguous',
        requiresConfirmation: true,
        message: '有多条相关记忆，请确认要删除哪一条。',
        candidateTargets: topicMatches
      }
    }
    const target = topicMatches[0] ?? { kind: 'topic', text: t }
    return {
      status: 'ready',
      command: {
        kind: 'delete',
        target,
        scope: 'memory_only',
        sessionId: ctx.sessionId,
        timezone: ctx.timezone,
        turnId: ctx.turnId
      }
    }
  }

  return { status: 'none' }
}

export function buildControlIdempotencyKey(
  command: Pick<MemoryControlCommand, 'kind' | 'target'> & { scope?: 'memory_only' | 'memory_and_source' },
  resolvedScopeId: string | null
): string {
  const scope =
    command.kind === 'delete' && 'scope' in command ? command.scope : ''
  return `control:${command.kind}:${resolvedScopeId ?? command.target.kind}:${scope}`
}
