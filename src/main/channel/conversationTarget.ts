import type { ChannelPlan } from '../../shared/channelPlan'
import { peekPendingAction } from './pendingAction'
import { getLastPlugin, getSlot } from './pinnedSlot'
import { readActionControlView } from '../memory/actions/actionControlView.js'

export type ConversationTargetKind =
  | 'pending_plan'
  | 'active_work'
  | 'queued_work'
  | 'active_plugin'
  | 'ambiguous'
  | 'none'

export type ConversationTarget = {
  kind: ConversationTargetKind
  planId?: string
  queueJobId?: string
  extensionId?: string
  label: string
}

export function resolveConversationTarget(input: {
  sessionId: string
  dataRoot?: string
  text: string
  pending?: ChannelPlan
}): ConversationTarget {
  const pending = input.pending ?? peekPendingAction(input.sessionId)?.plan
  const slot = getSlot(input.sessionId)
  const durable = input.dataRoot ? readActionControlView(input.dataRoot, input.sessionId) : null
  const queue = input.dataRoot ? (durable?.queued ?? []) : slot.jobQueue.map((job) => ({
    id: job.id, planId: job.plan.planId, summary: job.plan.summary ?? job.plan.intent,
    cwd: job.plan.cwd
  }))
  const durableLive = durable ? durable.live : null
  const workRunning = input.dataRoot
    ? Boolean(durableLive && (durableLive.status === 'running' || durableLive.status === 'waiting_permission'))
    : slot.status === 'running' || slot.status === 'waiting_permission'
  const workPlanId = durable ? undefined : slot.plan?.planId
  const workLabel = durable ? durableLive?.execution?.prompt ?? '当前任务' : slot.plan?.summary ?? slot.summary ?? '当前任务'
  const plugin = getLastPlugin(input.sessionId, input.dataRoot)
  const t = input.text.trim()
  const mentionsQueue = /队列|下一件|排队/.test(t)
  const mentionsPending = /刚才|这个方案|这张卡|确认卡|草案/.test(t)
  const mentionsWork = /工人|工队|这个活|这个任务|当前任务|这项任务|任务|代码|改代码|\bthe job\b|\bthe work\b/i.test(t)
  const mentionsPlugin = /插件|计时|番茄|倒计时|这个扩展/.test(t)

  if (mentionsQueue && queue.length) {
    const hinted = queue.length === 1 ? queue[0] : hintQueueJob(queue, t)
    return {
      kind: 'queued_work',
      queueJobId: hinted?.id,
      planId: hinted?.planId,
      label: hinted ? `队列 ${hinted.summary}` : `队列 ${queue.length} 件`
    }
  }
  if (mentionsPending && pending) {
    return { kind: 'pending_plan', planId: pending.planId, label: pending.summary ?? pending.intent }
  }
  if (mentionsWork && workRunning) {
    return { kind: 'active_work', planId: workPlanId, label: workLabel }
  }
  if (mentionsPlugin && plugin) {
    return { kind: 'active_plugin', extensionId: plugin.extensionId, label: plugin.name }
  }

  const live: ConversationTarget[] = []
  if (pending) live.push({ kind: 'pending_plan', planId: pending.planId, label: pending.summary ?? pending.intent })
  if (workRunning) {
    live.push({ kind: 'active_work', planId: workPlanId, label: workLabel })
  }
  if (plugin && Date.now() - plugin.at < 30 * 60_000) {
    live.push({ kind: 'active_plugin', extensionId: plugin.extensionId, label: plugin.name })
  }
  if (live.length === 1) return live[0]
  if (live.length > 1) return { kind: 'ambiguous', label: live.map((x) => x.label).join(' / ') }
  return { kind: 'none', label: '' }
}

function hintQueueJob<T extends { summary: string; cwd?: string }>(queue: T[], text: string): T | undefined {
  const lower = text.toLowerCase()
  return queue.find((j) => {
    const name = j.summary.toLowerCase()
    const cwd = (j.cwd ?? '').toLowerCase()
    return (name && lower.includes(name.slice(0, 8))) || (cwd && lower.includes(cwd.replace(/\\/g, '/').slice(-12)))
  })
}
