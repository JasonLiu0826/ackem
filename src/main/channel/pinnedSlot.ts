import type { ChannelPlan } from '../../shared/channelPlan'
import { lastPluginAction } from '../memory/actions/lastPluginAction.js'

/** UI cache. Durable success and queue membership live on ActionRun. */
export type SlotStatus = 'idle' | 'running' | 'waiting_permission' | 'delivered' | 'failed' | 'aborted' | 'unknown'

export type QueuedJob = {
  id: string
  plan: ChannelPlan
  cwd?: string
  prompt: string
}

export type PinnedAckemSlot = {
  chatSessionId: string
  codeSessionId: string | null
  workKind: 'job' | 'factory' | null
  summary: string
  cwd?: string
  status: SlotStatus
  plan?: ChannelPlan
  followQueue: string[]
  jobQueue: QueuedJob[]
}

const slots = new Map<string, PinnedAckemSlot>()

/** Optional display-name cache. ActionRun is the authority for plugin identity. */
export type LastPluginReceipt = { extensionId: string; name: string; at: number }
const lastPluginNames = new Map<string, LastPluginReceipt>()

export function rememberLastPlugin(sessionId: string, extensionId: string, name: string): void {
  lastPluginNames.set(sessionId, { extensionId, name, at: Date.now() })
}

export function getLastPlugin(sessionId: string, dataRoot?: string): LastPluginReceipt | undefined {
  if (dataRoot) {
    const durable = lastPluginAction(dataRoot, sessionId)
    if (durable) {
      const cached = lastPluginNames.get(sessionId)
      return { extensionId: durable.extensionId, name: cached?.extensionId === durable.extensionId ? cached.name : durable.extensionId, at: durable.at }
    }
    return undefined
  }
  return lastPluginNames.get(sessionId)
}

export function resetLastPlugin(sessionId?: string): void {
  if (sessionId) lastPluginNames.delete(sessionId)
  else lastPluginNames.clear()
}

export function getSlot(chatSessionId: string): PinnedAckemSlot {
  let slot = slots.get(chatSessionId)
  if (!slot) {
    slot = {
      chatSessionId,
      codeSessionId: null,
      workKind: null,
      summary: '',
      status: 'idle',
      followQueue: [],
      jobQueue: []
    }
    slots.set(chatSessionId, slot)
  }
  return slot
}

export function cancelQueuedJob(chatSessionId: string, jobId?: string): QueuedJob | undefined {
  const slot = getSlot(chatSessionId)
  if (!slot.jobQueue.length) return undefined
  if (!jobId) return slot.jobQueue.pop()
  const i = slot.jobQueue.findIndex((j) => j.id === jobId)
  if (i < 0) return undefined
  return slot.jobQueue.splice(i, 1)[0]
}

export function enqueueFollow(chatSessionId: string, text: string): void {
  getSlot(chatSessionId).followQueue.push(text)
}

export function mirrorQueuedJob(chatSessionId: string, job: Omit<QueuedJob, 'id'> & { id: string }): void {
  const slot = getSlot(chatSessionId)
  if (slot.jobQueue.some((item) => item.id === job.id)) return
  slot.jobQueue.push({ id: job.id, plan: job.plan, cwd: job.cwd, prompt: job.prompt })
}

export function projectWorkCache(
  chatSessionId: string,
  view: { status: SlotStatus; codeSessionId?: string | null; summary?: string; cwd?: string }
): void {
  const slot = getSlot(chatSessionId)
  slot.status = view.status
  if (view.codeSessionId !== undefined) slot.codeSessionId = view.codeSessionId
  if (view.summary !== undefined) slot.summary = view.summary
  if (view.cwd !== undefined) slot.cwd = view.cwd
  if (view.status === 'idle' || view.status === 'delivered' || view.status === 'failed' || view.status === 'aborted' || view.status === 'unknown') {
    if (!view.codeSessionId) slot.codeSessionId = null
  }
}

export function markRunning(chatSessionId: string, codeSessionId: string, plan: ChannelPlan): void {
  const slot = getSlot(chatSessionId)
  slot.codeSessionId = codeSessionId
  slot.status = 'running'
  slot.workKind = plan.workKind ?? 'job'
  slot.summary = String(plan.summary ?? plan.params.summary ?? plan.tag ?? plan.intent)
  slot.cwd = plan.cwd
  slot.plan = plan
}

export function markSlotStatus(chatSessionId: string, status: SlotStatus): void {
  getSlot(chatSessionId).status = status
  if (status === 'idle' || status === 'delivered' || status === 'failed' || status === 'aborted') {
    getSlot(chatSessionId).codeSessionId = null
  }
}

export function resetSlots(): void {
  slots.clear()
  lastPluginNames.clear()
}
