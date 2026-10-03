import { routeChannel } from '../channel/routeChannel'
import { executeChannel, abortPinnedWork, recordPluginStop, type ExecuteResult } from '../channel/executeChannel'
import {
  peekAllPending,
  peekPendingAction,
  savePendingAction,
  savePendingActions
} from '../channel/pendingAction'
import { rememberLastPlugin, getLastPlugin } from '../channel/pinnedSlot'
import { stopPluginRuntime } from '../channel/pluginRuntime'
import { pendingViewOf, resolveTurnShortcuts } from '../channel/resolveTurn'
import { askMessageFor } from '../channel/askMessage'
import { rememberChannelPlan } from '../channel/lastPlan'
import { chatPlan } from '../channel/plans'
import { resolveIntent } from '../extensions/dispatch/intentResolver'
import { acceptDispatchExtension, rejectDispatchExtension } from '../extensions/dispatch/contextPipeline'
import type { ClassifyClient } from '../channel/classifyIntent'
import type { CatalogEntry } from '../channel/catalogTypes'
import type { ExtensionsCoordinator } from '../extensions/coordinator'
import type { DispatchResult, EngineSnapshot } from '../extensions/protocols'
import { runPreLlmTurn, type PreLlmResult } from '../engine/orchestrator'
import type { TurnConfirm } from '../../shared/channelPlan'
import { currentSessionId } from '../ipc/shared'
import { saveState } from '../engine/state-persistence'
import { createRouteTrace } from '../channel/routeTrace'
import {
  buildRouteVerdictEvidence,
  recordRouteVerdict,
  type RouteChannelName
} from './routeVerdict'
import {
  closeConfirmCard,
  commitTurnConfirm,
  type BeginChatTurnResult,
  type ChatSurface
} from './turnCoordinator'

type PreLlmArgs = Parameters<typeof runPreLlmTurn>[0]

function actionLooksLive(exec: ExecuteResult): boolean {
  if (exec.memoryDegraded) return false
  return (
    exec.status === 'succeeded' ||
    exec.status === 'running' ||
    exec.status === 'queued' ||
    exec.status === 'waiting_permission'
  )
}

export type ChannelPendingCard = {
  planId: string
  kind: 'create' | 'update' | 'work_job' | 'use_missing' | 'plugin_ask' | 'plugin_use'
  askMessage: string
  cwd?: string
  candidates?: Array<{ id: string; name: string }>
}

export type ChannelTurnPhase = {
  channelPending?: ChannelPendingCard
  preFromParallel?: PreLlmResult
  dispatchResult?: DispatchResult
  extraDispatchInjections: string[]
  resolvedMessageForKnowledge?: string
  dispatchMs: number
  cardClosed: boolean
  /** Set when the routing verdict could not be recorded (Codex D1 degradation contract). */
  verdictLedgerFailed: string | null
}

/**
 * 确认、路由、执行、确认卡收口。IPC 只负责 Electron 参数和最终拼装。
 */
export async function orchestrateChannelTurn(args: {
  turnConfirm?: TurnConfirm
  userText: string
  recentMessages?: Array<{ role: string; content: string }>
  dataRoot: string
  sessionId: string
  chatTurn: BeginChatTurnResult
  surface: ChatSurface
  revision: string
  catalogEntries: CatalogEntry[]
  catalogFailed: boolean
  llm: ClassifyClient
  redlineHit: boolean
  preBaseArgs: PreLlmArgs
  extCoordinator: ExtensionsCoordinator | null
  engineSnap: EngineSnapshot
  onResidual: () => void
  /** 阶段 3-4 思考中里程碑 sink (ipc/chat.ts 把它接到 chat:status). */
  onMilestone?: (text: string) => void
}): Promise<ChannelTurnPhase> {
  const {
    turnConfirm,
    userText,
    recentMessages,
    dataRoot: root,
    sessionId,
    chatTurn,
    surface,
    revision,
    catalogEntries,
    catalogFailed,
    llm,
    redlineHit,
    preBaseArgs,
    extCoordinator,
    engineSnap,
    onResidual,
    onMilestone
  } = args
  let skipRouteChannel = redlineHit
  let dispatchResult: DispatchResult | undefined
  const extraDispatchInjections: string[] = []
  let resolvedMessageForKnowledge: string | undefined
  let dispatchMs = 0
  let channelPending: ChannelPendingCard | undefined
  let preFromParallel: PreLlmResult | undefined
  const names = Object.fromEntries(catalogEntries.map((e) => [e.id, e.name]))
  const trace = createRouteTrace()
  let verdictLedgerFailed: string | null = null

  /**
   * Route v2 §6.1 (Codex D1, 审计整改 #1): record the verdict the moment the
   * final channel is decided and BEFORE plan decisions / executeChannel /
   * control side effects. One shared writer; every exit calls this exactly once.
   */
  const commitVerdict = (draft: {
    channel: RouteChannelName
    motive: string
    exitRuleId?: string
    pendingConfirm?: string
    planId?: string
  }) => {
    const verdict = buildRouteVerdictEvidence({
      channel: draft.channel,
      motive: draft.motive,
      exitRuleId: draft.exitRuleId,
      pendingConfirm: draft.pendingConfirm,
      planId: draft.planId,
      trace
    })
    const recorded = recordRouteVerdict({ dataRoot: root, turnId: chatTurn.turnId, verdict })
    if (!recorded.ok) verdictLedgerFailed = recorded.message
  }

  if (redlineHit) {
    trace.mark({ layer: 'redline', ruleId: 'redline:hit' })
    commitVerdict({ channel: 'chat', motive: 'redline', exitRuleId: 'redline:hit' })
  }

  if (turnConfirm) {
    const tDispatch = Date.now()
    const pendingBefore = peekPendingAction(sessionId)
    // 整改 #1: applyTurnConfirm only mutates the in-memory card store; the
    // durable plan.decided write happens inside commitTurnConfirm. We split
    // that ordering: first learn the confirm outcome via applyTurnConfirm
    // semantics through commitTurnConfirm is NOT possible without racing, so
    // we commit the verdict AFTER commitTurnConfirm returns but BEFORE any
    // executeChannel / plan side effects of THIS turn — the confirm decision
    // itself (plan.accepted/rejected) is the user's act on the PREVIOUS
    // proposal, while THIS turn's verdict describes the newly decided channel.
    const confirmed = commitTurnConfirm({
      dataRoot: root,
      sessionId,
      confirm: turnConfirm,
      catalogRevision: revision,
      enabledIds: catalogEntries.filter((e) => e.status === 'active').map((e) => e.id)
    })
    if (!redlineHit) {
      commitVerdict({
        channel: confirmed.ok ? confirmed.plan.channel : 'chat',
        motive: 'confirm',
        exitRuleId: !confirmed.ok
          ? confirmed.reason === '用户拒绝'
            ? 'confirm:rejected'
            : 'confirm:invalid'
          : confirmed.plan.pendingConfirm
            ? 'confirm:chain'
            : 'confirm:accepted',
        pendingConfirm: confirmed.ok ? confirmed.plan.pendingConfirm : undefined,
        planId: confirmed.ok ? confirmed.plan.planId : undefined
      })
    }
    const [prePartial] = await Promise.all([
      runPreLlmTurn({ ...preBaseArgs, dispatchResult: undefined })
    ])
    dispatchMs = Date.now() - tDispatch
    preFromParallel = prePartial
    if (!turnConfirm.accepted && pendingBefore?.plan.extensionId) {
      rejectDispatchExtension(sessionId, pendingBefore.plan.extensionId, { dataRoot: root })
    }
    if (confirmed.ok) {
      if (confirmed.plan.pendingConfirm) {
        // Verdict was committed above with exit confirm:chain + pendingConfirm.
        rememberChannelPlan(sessionId, confirmed.plan, false)
        const current = peekPendingAction(sessionId)
        channelPending = current
          ? pendingViewOf(current, names, peekAllPending(sessionId).length - 1)
          : {
              planId: confirmed.plan.planId ?? '',
              kind: confirmed.plan.pendingConfirm,
              askMessage: askMessageFor(confirmed.plan, names),
              cwd: confirmed.plan.cwd,
              candidates: confirmed.plan.candidateExtensionIds?.map((id) => ({
                id,
                name: names[id] ?? id
              }))
            }
      } else {
        // Verdict was committed above (confirm:accepted) before executeChannel.
        const exec = await executeChannel({
          plan: confirmed.plan,
          userText,
          chatSessionId: sessionId,
          coordinator: extCoordinator,
          snapshot: engineSnap,
          dataRoot: root,
          turnId: chatTurn.turnId,
          correlationId: chatTurn.correlationId
        })
        extraDispatchInjections.push(...exec.extraInjections)
        if (exec.memoryDegraded && exec.error) extraDispatchInjections.push(`【记忆降级】${exec.error}`)
        else if (!actionLooksLive(exec) && exec.error) extraDispatchInjections.push(`【执行未完成】${exec.error}`)
        rememberChannelPlan(sessionId, confirmed.plan, actionLooksLive(exec))
        if (confirmed.plan.channel === 'plugin' && confirmed.plan.extensionId && actionLooksLive(exec)) {
          acceptDispatchExtension(root, confirmed.plan.extensionId)
          rememberLastPlugin(
            sessionId,
            confirmed.plan.extensionId,
            catalogEntries.find((e) => e.id === confirmed.plan.extensionId)?.name ?? confirmed.plan.extensionId
          )
          dispatchResult = {
            decision: 'auto_invoke',
            extensionId: confirmed.plan.extensionId,
            confidence: 1,
            reasoning: 'turnConfirm'
          }
        }
        if (confirmed.next) {
          channelPending = pendingViewOf(confirmed.next, names, peekAllPending(sessionId).length - 1)
        }
      }
    } else {
      // Verdict was committed above (confirm:rejected / confirm:invalid).
      extraDispatchInjections.push(`【确认未执行】${confirmed.reason}`)
      if (confirmed.next) {
        channelPending = pendingViewOf(confirmed.next, names, peekAllPending(sessionId).length - 1)
      }
    }
  } else {
    const resolved = await resolveIntent(userText, sessionId, llm)
    resolvedMessageForKnowledge = resolved.resolvedMessage
    if (!redlineHit) {
      const shortcut = resolveTurnShortcuts({
        sessionId,
        dataRoot: root,
        text: resolved.resolvedMessage,
        catalogRevision: revision,
        enabledIds: catalogEntries.filter((e) => e.status === 'active').map((e) => e.id)
      })
      if (shortcut.kind === 'patch') {
        skipRouteChannel = true
        commitVerdict({
          channel: shortcut.plan.channel,
          motive: 'shortcut',
          exitRuleId: 'shortcut:patch',
          pendingConfirm: shortcut.plan.pendingConfirm,
          planId: shortcut.plan.planId
        })
        rememberChannelPlan(sessionId, shortcut.plan, false)
        channelPending = pendingViewOf(shortcut.action, names)
      } else if (shortcut.kind === 'patch_failed') {
        skipRouteChannel = true
        commitVerdict({ channel: 'chat', motive: 'shortcut', exitRuleId: 'shortcut:patch_failed' })
        extraDispatchInjections.push(`【确认未执行】${shortcut.reason}`)
      } else if (shortcut.kind === 'control') {
        skipRouteChannel = true
        // 整改 #1: commit before abort/stop side effects below.
        commitVerdict({
          channel: 'chat',
          motive: 'shortcut',
          exitRuleId: `shortcut:control:${shortcut.control.verb}`
        })
        if (shortcut.control.verb === 'abort_work') {
          await abortPinnedWork(sessionId, root)
        }
        if (shortcut.control.verb === 'stop_plugin') {
          const extensionId = shortcut.control.extensionId ?? getLastPlugin(sessionId, root)?.extensionId
          const stopped = stopPluginRuntime(extensionId, sessionId)
          extraDispatchInjections.push(stopped.note)
          if (extensionId) {
            const recorded = await recordPluginStop({
              dataRoot: root,
              sessionId,
              extensionId,
              ok: stopped.ok,
              summary: stopped.note
            })
            if (recorded.memoryDegraded) {
              extraDispatchInjections.push(`【记忆降级】${recorded.error ?? '停止结果没有写入记忆'}`)
            } else if (!stopped.ok) extraDispatchInjections.push(`【执行未完成】${recorded.error ?? stopped.note}`)
          }
        } else {
          extraDispatchInjections.push(...shortcut.injections)
        }
      }
    }
    const tDispatch = Date.now()
    const [routed, prePartial] = await Promise.all([
      skipRouteChannel
        ? Promise.resolve(null)
        : routeChannel({
            text: resolved.resolvedMessage,
            catalog: catalogEntries,
            recent: recentMessages,
            sessionId,
            llm,
            catalogFailed,
            onResidual,
            trace,
            dataRoot: root
          }),
      runPreLlmTurn({
        ...preBaseArgs,
        msg: resolved.resolvedMessage,
        dispatchResult: undefined
      })
    ])
    dispatchMs = Date.now() - tDispatch
    preFromParallel = prePartial
    if (routed) {
      extraDispatchInjections.push(routed.plan.grounding)
      if (routed.split && routed.extras?.length) {
        commitVerdict({
          channel: routed.plan.channel,
          motive: routed.motive.kind,
          exitRuleId: 'route:split_pending',
          pendingConfirm: routed.plan.pendingConfirm,
          planId: routed.plan.planId
        })
        rememberChannelPlan(sessionId, routed.plan, false)
        const actions = savePendingActions(
          sessionId,
          [
            { sourceText: resolved.resolvedMessage, plan: routed.plan },
            ...routed.extras.map((plan) => ({ sourceText: resolved.resolvedMessage, plan }))
          ],
          revision
        )
        channelPending = pendingViewOf(actions[0], names, actions.length - 1)
      } else if (routed.plan.pendingConfirm) {
        commitVerdict({
          channel: routed.plan.channel,
          motive: routed.motive.kind,
          exitRuleId: 'route:pending',
          pendingConfirm: routed.plan.pendingConfirm,
          planId: routed.plan.planId
        })
        rememberChannelPlan(sessionId, routed.plan, false)
        const saved = savePendingAction(sessionId, resolved.resolvedMessage, routed.plan, revision)
        channelPending = pendingViewOf(saved, names)
      } else {
        // 整改 #1: commit BEFORE executeChannel so an execution throw still
        // leaves a verdict, and the ledger order is verdict → plan/execute.
        commitVerdict({
          channel: routed.plan.channel,
          motive: routed.motive.kind,
          exitRuleId: 'route:exec',
          planId: routed.plan.planId
        })
        const exec = await executeChannel({
          plan: routed.plan,
          userText: resolved.resolvedMessage,
          chatSessionId: sessionId,
          coordinator: extCoordinator,
          snapshot: engineSnap,
          dataRoot: root,
          turnId: chatTurn.turnId,
          correlationId: chatTurn.correlationId
        })
        extraDispatchInjections.push(...exec.extraInjections)
        if (exec.memoryDegraded && exec.error) extraDispatchInjections.push(`【记忆降级】${exec.error}`)
        else if (!actionLooksLive(exec) && exec.error) extraDispatchInjections.push(`【执行未完成】${exec.error}`)
        rememberChannelPlan(sessionId, routed.plan, actionLooksLive(exec))
        if (routed.plan.channel === 'plugin' && routed.plan.extensionId && actionLooksLive(exec)) {
          rememberLastPlugin(
            sessionId,
            routed.plan.extensionId,
            catalogEntries.find((e) => e.id === routed.plan.extensionId)?.name ?? routed.plan.extensionId
          )
          dispatchResult = {
            decision: 'auto_invoke',
            extensionId: routed.plan.extensionId,
            confidence: 1,
            reasoning: 'channel-router'
          }
        }
        if (routed.plan.chatDelivery === 'paper_card') {
          resolvedMessageForKnowledge = resolved.resolvedMessage
        }
      }
    }
  }

  // 整改 #1 三轮 (Codex): NO end-of-turn fallback. A transient write failure at
  // a real exit must NOT be papered over by a post-action `chat/unknown` verdict
  // (that would land after the action and misreport the channel). Per D1/J18,
  // a turn whose verdict write failed goes to the error counter via
  // verdictLedgerFailed; the next turn writes normally (一次失败、下次可写).

  if (skipRouteChannel && !turnConfirm) {
    rememberChannelPlan(sessionId, chatPlan('chat'), false)
  }

  if (channelPending && preFromParallel) {
    saveState(root, preFromParallel.newState, currentSessionId())
    closeConfirmCard({
      dataRoot: root,
      sessionId,
      turnId: chatTurn.turnId,
      userText,
      surface,
      planId: channelPending.planId,
      intent: channelPending.kind,
      summary: channelPending.askMessage
    })
    return {
      channelPending,
      preFromParallel,
      dispatchResult,
      extraDispatchInjections,
      resolvedMessageForKnowledge,
      dispatchMs,
      cardClosed: true,
      // 整改 #4: the confirm-card early return must carry ledger failure out
      // so ipc/chat.ts can surface it (memory-degradation contract, Codex D1).
      verdictLedgerFailed
    }
  }

  return {
    channelPending,
    preFromParallel,
    dispatchResult,
    extraDispatchInjections,
    resolvedMessageForKnowledge,
    dispatchMs,
    cardClosed: false,
    verdictLedgerFailed
  }
}
