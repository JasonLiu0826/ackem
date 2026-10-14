import type { ReplyEvent, ResponsePolicy } from '../../shared/response'
import { guardReplyText } from '../channel/outputGuard'
import { createLogger } from '../logger'
const log = createLogger('reply-lifecycle')

/** Request-local transport. Never monkey-patches the real Electron WebContents. */
export function createReplyTransport(send: (channel: string, ...args: unknown[]) => void, identity: { sessionId: string; turnId: string; replyId: string }, policy: ResponsePolicy) {
  const guardState = { fenced: false }
  let sequence = 0, terminal = false, pending = '', started = false
  const beganAt = Date.now()
  let firstContentAt: number | undefined, chars = 0
  const event = (payload: { type: ReplyEvent['type']; text?: string; generationState?: 'incomplete' }) => {
    if (payload.type === 'delta') { firstContentAt ??= Date.now(); chars += payload.text?.length ?? 0 }
    if (['completed', 'failed', 'cancelled'].includes(payload.type)) log.info('reply.terminal', { ...identity, origin: policy.origin, status: payload.type, firstContentMs: firstContentAt === undefined ? null : firstContentAt - beganAt, elapsedMs: Date.now() - beganAt, streamedChars: chars, events: sequence + 1 })
    send('chat:reply', { ...identity, runId: policy.runId, origin: policy.origin, sequence: ++sequence, at: Date.now(), ...payload })
  }
  const start = () => { if (!started) { started = true; event({ type: 'started' }) } }
  const publish = (text: string) => { if (text) { start(); event({ type: 'delta', text }); send('chat:chunk', text) } }
  const flush = (all = false) => {
    // Action claims are checked before publishing their sentence. Ordinary answers remain token-streamed.
    let cut = all ? pending.length : Math.max(pending.lastIndexOf('。'), pending.lastIndexOf('！'), pending.lastIndexOf('？'), pending.lastIndexOf('\n')) + 1
    if (cut > 0) { const text = pending.slice(0, cut); pending = pending.slice(cut); publish(guardReplyText(text, policy, guardState)) }
  }
  const dispatch = (channel: string, ...args: unknown[]) => {
    if (terminal && channel.startsWith('chat:')) return
    if (channel === 'chat:chunk') {
      const text = String(args[0] ?? '')
      pending += text
      flush()
      // Hold only a potentially factual first-person/action clause; harmless prose flows immediately.
      if (pending && !/[我已成文网项测`\[]/.test(pending)) { publish(pending); pending = '' }
      return
    }
    if (channel === 'chat:replace') { pending = ''; start(); const text = guardReplyText(String(args[0] ?? ''), policy); event({ type: 'replace', text }); send(channel, text); return }
    if (channel === 'chat:stream-start') { start(); send(channel, ...args); return }
    if (channel === 'chat:reasoning' || channel === 'chat:status') { event({ type: channel === 'chat:reasoning' ? 'reasoning' : 'status', text: String(args[0] ?? '') }); send(channel, ...args); return }
    if (channel === 'chat:done') {
      flush(true); start(); const meta = (args[0] ?? {}) as Record<string, unknown>; const text = guardReplyText(String(meta.assistantText ?? ''), policy)
      event({ type: 'completed', text, ...(meta.generationState === 'incomplete' ? { generationState: 'incomplete' as const } : {}) }); terminal = true
      send(channel, { ...meta, ...identity, assistantText: text, origin: policy.origin, runId: policy.runId }); return
    }
    if (channel === 'chat:error') { flush(true); event({ type: 'failed', text: String(args[0] ?? '') }); terminal = true; send(channel, ...args); return }
    send(channel, ...args)
  }
  return { send: dispatch, cancel() { if (!terminal) { pending = ''; event({ type: 'cancelled' }); terminal = true } }, finish() { if (!terminal) { dispatch('chat:error', '回复流结束但未收到终态') } } }
}
