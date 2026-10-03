import type { ConversationTarget } from './conversationTarget'
import type { SlotStatus } from './pinnedSlot'

export type ControlIntent =
  | { verb: 'abort_work' }
  | { verb: 'stop_plugin'; extensionId?: string }
  | { verb: 'cancel_pending' }
  | { verb: 'cancel_queue'; queueJobId?: string }
  | { verb: 'status' }
  | { verb: 'ambiguous'; options: string[] }
  | { verb: 'none' }

const ABORT_RE = /先别做了|停掉|取消这个|别做了|停下|不做了|never mind|stop the job|cancel the (?:job|work)/i
const STATUS_RE = /做到哪了|还在做吗|进度怎么样|现在什么进度/
const PLUGIN_HINT = /插件|计时|番茄|倒计时|这个扩展/
const QUEUE_HINT = /队列|下一件|排队/
const PENDING_HINT = /这张卡|这个方案|确认卡|草案|刚才那个方案/

export function detectControlIntent(
  text: string,
  ctx: {
    slotStatus: SlotStatus
    hasPending: boolean
    queueLength: number
    hasPlugin: boolean
    lastPluginId?: string
    lastPluginName?: string
    target: ConversationTarget
  }
): ControlIntent {
  const t = text.trim()
  const running = ctx.slotStatus === 'running' || ctx.slotStatus === 'waiting_permission'

  if (STATUS_RE.test(t) && (running || ctx.slotStatus === 'unknown')) return { verb: 'status' }

  if (QUEUE_HINT.test(t) && /取消|不要|删/.test(t) && ctx.queueLength > 0) {
    return { verb: 'cancel_queue', queueJobId: ctx.target.queueJobId }
  }
  if (PENDING_HINT.test(t) && /取消|不要|算了/.test(t) && ctx.hasPending) {
    return { verb: 'cancel_pending' }
  }

  if (!ABORT_RE.test(t)) return { verb: 'none' }

  if (ctx.target.kind === 'queued_work' || (QUEUE_HINT.test(t) && ctx.queueLength > 0)) {
    return { verb: 'cancel_queue', queueJobId: ctx.target.queueJobId }
  }
  if (ctx.target.kind === 'pending_plan' || (PENDING_HINT.test(t) && ctx.hasPending)) {
    return { verb: 'cancel_pending' }
  }
  if (ctx.target.kind === 'active_plugin' || (PLUGIN_HINT.test(t) && ctx.hasPlugin)) {
    return { verb: 'stop_plugin', extensionId: ctx.lastPluginId ?? ctx.target.extensionId }
  }
  if (ctx.target.kind === 'active_work' && running) return { verb: 'abort_work' }

  if (running && ctx.hasPlugin && PLUGIN_HINT.test(t) === false && !/工人|工队|这个活|任务/.test(t)) {
    return {
      verb: 'ambiguous',
      options: ['当前任务', ctx.lastPluginName ?? '刚才的插件']
    }
  }
  if (running) return { verb: 'abort_work' }
  if (ctx.hasPending && /取消这个|不做了|算了/.test(t)) return { verb: 'cancel_pending' }
  return { verb: 'none' }
}
