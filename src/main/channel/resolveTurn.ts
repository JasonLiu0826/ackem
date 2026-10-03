import type { ChannelPlan, PendingChannelAction } from '../../shared/channelPlan'
import { askMessageFor } from './askMessage'
import { resolveConversationTarget } from './conversationTarget'
import { detectPlanPatch } from './detectPlanPatch'
import {
  applyPlanPatch,
  dismissPending,
  peekAllPending,
  peekPendingAction,
  peekPendingForPatch,
  type PlanPatch
} from './pendingAction'
import { cancelQueuedJob, getLastPlugin, getSlot, type SlotStatus } from './pinnedSlot'
import { detectControlIntent, type ControlIntent } from './receiptControl'
import { readActionControlView } from '../memory/actions/actionControlView.js'
import { createActionCoordinator } from '../memory/actions/actionCoordinator.js'

export type TurnShortcut =
  | { kind: 'patch'; plan: ChannelPlan; action: PendingChannelAction }
  | { kind: 'patch_failed'; reason: string }
  | { kind: 'control'; control: ControlIntent; injections: string[] }
  | { kind: 'continue' }

export function resolveTurnShortcuts(input: {
  sessionId: string
  dataRoot?: string
  text: string
  catalogRevision: string
  enabledIds: string[]
}): TurnShortcut {
  const pending = peekPendingForPatch(input.sessionId, input.text) ?? peekPendingAction(input.sessionId)
  const target = resolveConversationTarget({
    sessionId: input.sessionId,
    dataRoot: input.dataRoot,
    text: input.text,
    pending: pending?.plan
  })

  if (pending) {
    const patch: PlanPatch | null = detectPlanPatch(input.text, pending.plan)
    if (patch) {
      patch.planId = pending.planId
      const applied = applyPlanPatch(input.sessionId, patch, {
        catalogRevision: input.catalogRevision,
        enabledIds: input.enabledIds
      })
      if (applied.ok) return { kind: 'patch', plan: applied.plan, action: applied.action }
      return { kind: 'patch_failed', reason: applied.reason }
    }
  }

  const slot = getSlot(input.sessionId)
  const durable = input.dataRoot ? readActionControlView(input.dataRoot, input.sessionId) : null
  const durableStatus: SlotStatus = durable?.live?.status === 'running' || durable?.live?.status === 'waiting_permission'
    ? durable.live.status
    : durable?.live?.status === 'unknown' ? 'unknown' : 'idle'
  const plugin = getLastPlugin(input.sessionId, input.dataRoot)
  const control = detectControlIntent(input.text, {
    slotStatus: input.dataRoot ? durableStatus : slot.status,
    hasPending: Boolean(pending),
    queueLength: input.dataRoot ? durable?.queued.length ?? 0 : slot.jobQueue.length,
    hasPlugin: Boolean(plugin),
    lastPluginId: plugin?.extensionId,
    lastPluginName: plugin?.name,
    target
  })
  if (control.verb === 'none') return { kind: 'continue' }

  const injections: string[] = []
  if (control.verb === 'cancel_pending') {
    const next = dismissPending(input.sessionId, target.planId)
    injections.push(
      next
        ? `【本轮通道】chat\n【状态】已取消这张卡。还有 ${peekAllPending(input.sessionId).length} 张待确认。`
        : '【本轮通道】chat\n【状态】已取消确认卡。'
    )
  } else if (control.verb === 'cancel_queue') {
    let removed: { summary: string } | undefined
    let cancelError: string | undefined
    if (input.dataRoot) {
      const queued = control.queueJobId
        ? durable?.queued.find((job) => job.id === control.queueJobId)
        : durable?.queued.at(-1)
      if (queued) {
        const cancelled = createActionCoordinator(input.dataRoot).cancelQueued(queued.id, queued.version)
        if (cancelled.ok) {
          cancelQueuedJob(input.sessionId, queued.id)
          removed = queued
        } else {
          cancelError = cancelled.code
        }
      }
    } else {
      const cached = cancelQueuedJob(input.sessionId, control.queueJobId)
      if (cached) removed = { summary: cached.plan.summary ?? cached.prompt }
    }
    injections.push(
      cancelError
        ? `【本轮通道】chat\n【状态】取消队列失败：${cancelError}`
        : removed
        ? `【本轮通道】chat\n【状态】已取消队列：${removed.summary}`
        : '【本轮通道】chat\n【状态】队列里没有可取消的活。'
    )
  } else if (control.verb === 'stop_plugin') {
    injections.push(
      `【本轮通道】chat\n【状态】停插件 ${control.extensionId ?? plugin?.name ?? ''}。不中止任务。`
    )
  } else if (control.verb === 'abort_work') {
    injections.push('【本轮通道】chat\n【状态】已停止当前任务。队列保留。')
  } else if (control.verb === 'status') {
    const status = durable?.live?.status ?? slot.status
    const cwd = durable?.live?.execution?.cwd ?? slot.cwd ?? ''
    const summary = durable?.live?.execution?.prompt ?? slot.summary
    injections.push(`【本轮通道】chat\n【状态】任务 ${status}。${cwd} ${summary}`)
  } else if (control.verb === 'ambiguous') {
    injections.push(`【本轮通道】chat\n【状态】请指明要停哪一个：${control.options.join('，还是')}`)
  }

  return { kind: 'control', control, injections }
}

export function pendingViewOf(
  action: PendingChannelAction,
  names: Record<string, string>,
  remainingAfter = 0
): {
  planId: string
  kind: NonNullable<ChannelPlan['pendingConfirm']>
  askMessage: string
  cwd?: string
  candidates?: Array<{ id: string; name: string }>
} | undefined {
  const kind = action.plan.pendingConfirm
  if (!kind) return undefined
  const ask = askMessageFor(action.plan, names)
  return {
    planId: action.planId,
    kind,
    askMessage: remainingAfter > 0 ? `${ask} 这句话还有 ${remainingAfter} 件待确认。` : ask,
    cwd: action.plan.cwd,
    candidates: action.plan.candidateExtensionIds?.map((id) => ({
      id,
      name: names[id] ?? id
    }))
  }
}
