/**
 * FIX-034 — Chat 发送关键路径（纯函数，供 ChatPage 与单测共用）
 */
import type { AppSettings } from '../ackem'
import type { ChatRow } from '../store/appStore'

export type ChatSendBlockReason =
  | 'no_settings'
  | 'empty_input'
  | 'busy'
  | 'missing_api_base'
  | 'age_not_confirmed'
  | 'embedding_warming'

export type EmbeddingReadinessPhase =
  | 'idle'
  | 'loading_provider'
  | 'syncing_facts'
  | 'warming_prellm'
  | 'ready'
  | 'degraded'

export type EmbeddingReadinessSnapshot = {
  phase: EmbeddingReadinessPhase
  progress: number
  providerReady: boolean
  factEmbeddingsReady: boolean
  preLlmWarmReady: boolean
  error?: string
}

export function isEmbeddingReadyForChat(
  readiness: EmbeddingReadinessSnapshot | null | undefined
): boolean {
  if (!readiness) return false
  return readiness.phase === 'ready' || readiness.phase === 'degraded'
}

export type ChatSendValidation =
  | { ok: true; raw: string; clean: string; rel?: string }
  | { ok: false; reason: ChatSendBlockReason }

/** 用户消息中的 @path.md 显式引用 */
export function parseExplicitAt(
  text: string,
  docOnlyFallback = '（仅文档）'
): { clean: string; rel?: string } {
  const m = text.match(/@([\w./\\-]+\.(?:md|txt))\b/i)
  if (!m) return { clean: text }
  const rel = m[1].replace(/\\/g, '/')
  const clean = text.replace(m[0], '').trim()
  return { clean: clean.length > 0 ? clean : docOnlyFallback, rel }
}

/** 按当前 LLM provider 判断 API 是否已配置 */
export function hasLlmApiConfigured(settings: AppSettings): boolean {
  const provider = settings.llmProvider ?? 'openai'
  if (provider === 'anthropic') {
    return Boolean(settings.anthropicBaseUrl?.trim())
  }
  return Boolean(settings.openaiBaseUrl?.trim())
}

/** 发送前门禁：与 ChatPage.send 一致，便于单测覆盖回归 */
export function validateChatSend(
  input: string,
  settings: AppSettings | null,
  busy: boolean,
  docOnlyFallback = '（仅文档）',
  embeddingReadiness?: EmbeddingReadinessSnapshot | null
): ChatSendValidation {
  const raw = input.trim()
  if (!settings) return { ok: false, reason: 'no_settings' }
  if (!raw) return { ok: false, reason: 'empty_input' }
  if (busy) return { ok: false, reason: 'busy' }
  if (!isEmbeddingReadyForChat(embeddingReadiness)) {
    return { ok: false, reason: 'embedding_warming' }
  }
  if (!hasLlmApiConfigured(settings)) return { ok: false, reason: 'missing_api_base' }
  if (!settings.ageConfirmed18) return { ok: false, reason: 'age_not_confirmed' }
  const { clean, rel } = parseExplicitAt(raw, docOnlyFallback)
  return { ok: true, raw, clean, rel }
}

export type ChatSendOptimisticRows = {
  userLine: string
  rowsWithPlaceholder: ChatRow[]
  assistantIndex: number
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/** 乐观 UI：追加 user 行 + 空 assistant 占位，并截取 recent 供 buildContext */
export function buildChatSendOptimisticRows(
  rows: ChatRow[],
  userLine: string,
  recentLimit = 24
): ChatSendOptimisticRows {
  const nextCore: ChatRow[] = [...rows, { kind: 'message', role: 'user', content: userLine }]
  const assistantIndex = nextCore.length
  const rowsWithPlaceholder: ChatRow[] = [
    ...nextCore,
    { kind: 'message', role: 'assistant', content: '' }
  ]
  const recentMessages = nextCore
    .filter((m): m is Extract<ChatRow, { kind: 'message' }> => m.kind === 'message')
    .slice(-recentLimit)
    .map((m) => ({ role: m.role, content: m.content }))
  return { userLine, rowsWithPlaceholder, assistantIndex, recentMessages }
}

export function buildChatContextRequest(params: {
  clean: string
  userLine: string
  rel?: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  sessionId: string
  turnIndex: number
  systemHint?: string
  desktopAgentChatMode?: boolean
}) {
  return {
    userText: params.clean || params.userLine,
    explicitRel: params.rel,
    recentMessages: params.recentMessages,
    sessionId: params.sessionId,
    turnIndex: params.turnIndex,
    ...(params.systemHint ? { systemHint: params.systemHint } : {}),
    ...(params.desktopAgentChatMode ? { desktopAgentChatMode: true } : {})
  }
}

export function chatSendBlockReasonMessage(reason: ChatSendBlockReason): string {
  switch (reason) {
    case 'no_settings':
      return 'settings.loading'
    case 'empty_input':
      return ''
    case 'busy':
      return 'Busy, please wait...'
    case 'missing_api_base':
      return 'Please configure API first'
    case 'age_not_confirmed':
      return '请先完成年龄确认'
    case 'embedding_warming':
      return 'chat.embedding.warming'
  }
}
