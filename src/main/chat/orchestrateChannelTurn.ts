import { routeChannel } from '../channel/routeChannel'
import { handleChatTaskInput, chatTaskCandidates } from '../tasks/runtime'
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
import type { ChannelPlan } from '../../shared/channelPlan'
import type { ExtensionsCoordinator } from '../extensions/coordinator'
import type { DispatchResult, EngineSnapshot } from '../extensions/protocols'
import { runPreLlmTurn, type PreLlmResult } from '../engine/orchestrator'
import type { TurnConfirm } from '../../shared/channelPlan'
import { currentSessionId } from '../ipc/shared'
import { abortChatWorkDispatch, dispatchChatWorkJob, type ChatWorkDispatch } from '../ipc/workbench'
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
  decideChatPlan,
  proposeChatPlan,
  finalizeChatTurn,
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

/** 自主派工时聊天页渲染的固定 ack (与主进程落账文本一致)。 */
export const WORK_DISPATCH_ACK = '收到，任务已接收。执行过程会留在工作页，完成后我会交付结果。'

export type ChannelTurnPhase = {
  channelPending?: ChannelPendingCard
  /** 自主派工 (2026-10-04 用户指令): work 任务不弹卡, 直接进工作台固定任务。 */
  workDispatch?: ChatWorkDispatch
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
  filePaths?: string[]
  imagePaths?: string[]
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
  let workDispatch: ChatWorkDispatch | undefined
  const extraDispatchInjections: string[] = []
  let resolvedMessageForKnowledge: string | undefined
  let dispatchMs = 0
  let channelPending: ChannelPendingCard | undefined
  let preFromParallel: PreLlmResult | undefined
  const names = Object.fromEntries(catalogEntries.map((e) => [e.id, e.name]))
  const trace = createRouteTrace()
  let verdictLedgerFailed: string | null = null

  /**
   * 自主执行 (2026-10-04 用户指令「不要弹窗，智能体要自主做事」):
   * work 计划 → 直接派工进工作台固定 Ackem 任务; 其余计划 → 自动补第一候选后
   * 内联执行。先记 verdict 再产生副作用, 与 route:exec 分支同一纪律。
   * skipVerdict: confirm 出口在分支顶部已记过 verdict, 不得重复记。
   */
  const runPlanAutonomously = async (
    plan: ChannelPlan,
    text: string,
    motive: string,
    opts: { index?: number; skipVerdict?: boolean } = {}
  ): Promise<void> => {
    if (!opts.skipVerdict) {
      commitVerdict({
        channel: plan.channel,
        motive,
        exitRuleId: 'route:exec',
        planId: plan.planId
      })
    }
    if (plan.channel === 'work') {
      try {
        const index = opts.index ?? 0
        const dispatch = await dispatchChatWorkJob({
          text,
          filePaths: args.filePaths,
          imagePaths: args.imagePaths,
          chatSessionId: sessionId,
          cwd: plan.cwd,
          inspectionScope: typeof plan.params.inspectionScope==='string'?plan.params.inspectionScope:undefined,
          dataRoot: root,
          turnId: index ? `${chatTurn.turnId}-${index}` : chatTurn.turnId,
          correlationId: chatTurn.correlationId
        })
        if (!workDispatch) workDispatch = dispatch
        rememberChannelPlan(sessionId, plan, true, chatTurn.turnId, { status: dispatch.queued ? 'queued' : 'running', runId: dispatch.runId })
        extraDispatchInjections.push(`【已派工】任务已交给工作台执行（工作目录 ${dispatch.cwd}），完成前请稍等。`)
      } catch (e) {
        rememberChannelPlan(sessionId, plan, false, chatTurn.turnId)
        extraDispatchInjections.push(`【派工失败】${e instanceof Error ? e.message : String(e)}`)
      }
      return
    }
    if (!plan.extensionId && plan.candidateExtensionIds?.length) plan.extensionId = plan.candidateExtensionIds[0]
    const exec = await executeChannel({
      plan,
      userText: text,
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
    rememberChannelPlan(sessionId, plan, actionLooksLive(exec), chatTurn.turnId, exec)
    if (plan.channel === 'plugin' && plan.extensionId && actionLooksLive(exec)) {
      acceptDispatchExtension(root, plan.extensionId)
      rememberLastPlugin(
        sessionId,
        plan.extensionId,
        catalogEntries.find((e) => e.id === plan.extensionId)?.name ?? plan.extensionId
      )
      dispatchResult = {
        decision: 'auto_invoke',
        extensionId: plan.extensionId,
        confidence: 1,
        reasoning: 'autonomous-route'
      }
    }
  }

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
      // 旧版确认卡遗留输入仍生效: 用户在卡里填过的目录/插件选择优先。
      if (turnConfirm.cwd) confirmed.plan.cwd = turnConfirm.cwd
      if (turnConfirm.extensionId) confirmed.plan.extensionId = turnConfirm.extensionId
      if (confirmed.plan.pendingConfirm || confirmed.plan.channel === 'work') {
        // 自主干道: 链式确认与 work 一律不弹卡 (verdict 已在分支顶部记过)。
        await runPlanAutonomously(confirmed.plan, userText, 'confirm', { skipVerdict: true })
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
        rememberChannelPlan(sessionId, confirmed.plan, actionLooksLive(exec), chatTurn.turnId, exec)
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
          // 链式后续: 自主执行, 不再弹下一张卡。
          await runPlanAutonomously(confirmed.next.plan, confirmed.next.sourceText || userText, 'confirm', { index: 1, skipVerdict: true })
        }
      }
    } else {
      // Verdict was committed above (confirm:rejected / confirm:invalid).
      extraDispatchInjections.push(`【确认未执行】${confirmed.reason}`)
      if (confirmed.next) {
        await runPlanAutonomously(confirmed.next.plan, confirmed.next.sourceText || userText, 'confirm', { index: 1, skipVerdict: true })
      }
    }
  } else {
    const hasTaskObjects = !redlineHit && chatTaskCandidates(root,sessionId).length>0
    const resolved = hasTaskObjects ? {resolvedMessage:userText} : await resolveIntent(userText, sessionId, llm)
    resolvedMessageForKnowledge = resolved.resolvedMessage
    if (!redlineHit) {
      const related = await handleChatTaskInput(root,{requestId:chatTurn.turnId,origin:'chat',conversationId:sessionId,text:resolved.resolvedMessage,attachments:[...(args.imagePaths??[]).map(path=>({path,kind:'image' as const})),...(args.filePaths??[]).map(path=>({path,kind:'file' as const}))]},onMilestone,()=>commitVerdict({channel:'chat',motive:'task-object-control',exitRuleId:'task:object-resolved'}))
      if(related){skipRouteChannel=true;extraDispatchInjections.push(`【任务事实回执】${related.message}\n任务ID：${related.taskId??''}。只回应本轮要求，不能把等待/停止请求说成完成。`)}
    }
    if (!redlineHit && !skipRouteChannel) {
      const shortcut = resolveTurnShortcuts({
        sessionId,
        dataRoot: root,
        text: resolved.resolvedMessage,
        catalogRevision: revision,
        enabledIds: catalogEntries.filter((e) => e.status === 'active').map((e) => e.id)
      })
      if (shortcut.kind === 'patch') {
        skipRouteChannel = true
        // 「补一下」自主执行: 原文+补充直接派工/执行, 不再回卡。
        await runPlanAutonomously(
          shortcut.plan,
          `${shortcut.action.sourceText}\n补充：${resolved.resolvedMessage}`,
          'shortcut'
        )
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
          // 派工进工作台的运行也一并停 (2026-10-04 自主管线)
          await abortChatWorkDispatch().catch(() => false)
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
    if(!skipRouteChannel&&!turnConfirm&&((args.imagePaths?.length??0)+(args.filePaths?.length??0)>0)){
      await runPlanAutonomously({channel:'work',intent:'work',tag:null,params:{},grounding:'用户附件由 AckemCode 内核读取，工作页留存执行与验收记录。'},resolved.resolvedMessage,'attachment')
      skipRouteChannel=true
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
            onMilestone,
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
        // 自主干道: 拆分任务逐条自主执行, 不再存成待确认卡。
        const plans = [routed.plan, ...routed.extras]
        for (let i = 0; i < plans.length; i++) {
          await runPlanAutonomously(plans[i]!, resolved.resolvedMessage, routed.motive.kind, { index: i })
        }
      } else if (routed.plan.pendingConfirm) {
        // 自主干道: work 派工进工作台, 插件卡自动补第一候选, 不再弹确认卡。
        await runPlanAutonomously(routed.plan, resolved.resolvedMessage, routed.motive.kind)
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
        rememberChannelPlan(sessionId, routed.plan, actionLooksLive(exec), chatTurn.turnId, exec)
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

  if (skipRouteChannel && !turnConfirm && !workDispatch) {
    rememberChannelPlan(sessionId, chatPlan('chat'), false, chatTurn.turnId)
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
      workDispatch,
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

  // 自主派工收口: plan.proposed + plan.decided(accepted) + turn.finalized(ack)。
  // 跳过 LLM, 聊天页直接渲染同一句 ack, 历史与记忆两侧一致。
  if (workDispatch) {
    const proposed = proposeChatPlan({
      dataRoot: root,
      turnId: chatTurn.turnId,
      plan: {
        planId: workDispatch.turnId,
        nature: 'work',
        intent: 'work_job',
        targetId: workDispatch.cwd,
        summary: WORK_DISPATCH_ACK,
        requiresConfirmation: false
      }
    })
    decideChatPlan({ dataRoot: root, planId: workDispatch.turnId, accepted: true })
    finalizeChatTurn({
      dataRoot: root,
      sessionId,
      turnId: chatTurn.turnId,
      userText,
      assistantText: WORK_DISPATCH_ACK,
      surface
    })
  }

  return {
    channelPending,
    workDispatch,
    preFromParallel,
    dispatchResult,
    extraDispatchInjections,
    resolvedMessageForKnowledge,
    dispatchMs,
    cardClosed: false,
    verdictLedgerFailed
  }
}
