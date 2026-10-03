import type { PreLlmResult } from '../engine/orchestrator.js'
import type { FullState } from '../engine/types.js'
import type { AppSettings } from '../settings.js'
import { runPreLlmTurn } from '../engine/orchestrator.js'
import { registerAndFinalizeSkipTurn } from '../postChatTurn.js'
import { executeMemoryAuditTurn } from '../memory/memoryAudit/executeMemoryAuditTurn.js'
import { saveState } from '../engine/state-persistence.js'
import { recordRouteVerdict } from './routeVerdict.js'
import type { FactStore } from '../memory/factStore.js'
import type { EpisodicStore } from '../memory/episodicStore.js'
import type { MemoryAuditIntent } from '../../shared/memoryAuditIntent.js'

/** Audit shortcut must finalize the turn that beginChatTurn already opened. */
export async function completeMemoryAuditShortcut(args: {
  turnId: string
  dataRoot: string
  sessionId: string
  turnIndex: number
  userMsg: string
  assistantText: string
  pre: PreLlmResult
  prevState: FullState
  settings: AppSettings
}): Promise<void> {
  await registerAndFinalizeSkipTurn({
    turnId: args.turnId,
    dataRoot: args.dataRoot,
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    userMsg: args.userMsg,
    assistantText: args.assistantText,
    newState: args.pre.newState,
    prevState: args.prevState,
    trace: args.pre.trace,
    event: args.pre.event,
    settings: args.settings,
    skipIngest: true,
    surface: 'desktop'
  })
}

/**
 * Route v2 §6.1 (Codex 审计整改 #2 二轮): the REAL audit-shortcut turn seam —
 * verdict recorded BEFORE the reply is produced, then the deterministic audit
 * reply runs and the turn is finalized. This is the function ipc/chat.ts calls;
 * tests exercise it with a stubbed pre-turn (the engine pre-turn is not the
 * seam under test — the ledger ordering is).
 */
export async function runMemoryAuditShortcutTurn(args: {
  dataRoot: string
  sessionId: string
  saveSessionId: string
  turnId: string
  turnIndex: number
  userText: string
  auditIntent: MemoryAuditIntent
  state: FullState
  store: FactStore
  epStore: EpisodicStore
  retriever: unknown
  preparedTurn?: unknown
  memoryBudgetChars: number
  settings: AppSettings
  /** Pre-turn override for tests; production uses the real runPreLlmTurn(ultralite). */
  runPreLlmImpl?: (msg: string) => Promise<PreLlmResult>
  notify?: (status: string) => void
  /** Electron WebContents for the memory-audit card delivery (optional in tests). */
  webContents?: { send: (channel: string, payload: unknown) => void }
}): Promise<{ intro: string; pre: PreLlmResult; verdictDegraded: boolean }> {
  let verdictDegraded = false
  const recorded = recordRouteVerdict({
    dataRoot: args.dataRoot,
    turnId: args.turnId,
    verdict: {
      finalChannel: 'chat',
      motive: 'audit_shortcut',
      layers: [{ layer: 'redline', ruleId: 'shortcut:memory_audit', ms: 0 }],
      usedClassifier: false
    }
  })
  if (!recorded.ok) {
    verdictDegraded = true
    args.notify?.(`【记忆降级】判决未落账：${recorded.message}`)
  }

  const runPreLlm = args.runPreLlmImpl ?? (async (msg: string) => {
    return runPreLlmTurn({
      msg,
      prev: args.state,
      factStore: args.store,
      retriever: args.retriever as never,
      sessionId: args.sessionId,
      dataRoot: args.dataRoot,
      turnIndex: args.turnIndex,
      memoryBudgetChars: args.memoryBudgetChars,
      ultralite: true,
      preparedTurn: args.preparedTurn as never,
    })
  })
  const preAudit = await runPreLlm(args.userText)
  const { intro, pre } = executeMemoryAuditTurn({
    dataRoot: args.dataRoot,
    factStore: args.store,
    episodicStore: args.epStore,
    intent: args.auditIntent,
    pre: preAudit,
    webContents: args.webContents as never,
  })
  saveState(args.dataRoot, pre.newState, args.saveSessionId)
  await completeMemoryAuditShortcut({
    turnId: args.turnId,
    dataRoot: args.dataRoot,
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    userMsg: args.userText,
    assistantText: intro,
    pre: preAudit,
    prevState: args.state,
    settings: args.settings,
  })
  void verdictDegraded
  return { intro, pre, verdictDegraded }
}
