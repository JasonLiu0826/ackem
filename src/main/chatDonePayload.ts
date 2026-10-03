import type { WebContents } from 'electron'
import { buildTurnStateDelta, type TurnStateDelta } from './engine/stateDelta'
import { peekPendingTurn } from './turnPending'

export type ChatDonePayload = {
  memoryWrites?: string[]
  assistantText?: string
  turnId?: string
  stateDelta?: TurnStateDelta
}

export function enrichChatDonePayload(
  turnId: string | undefined,
  base: Omit<ChatDonePayload, 'stateDelta'>
): ChatDonePayload {
  if (!turnId) return base
  const p = peekPendingTurn(turnId)
  if (!p?.prevState) return { ...base, turnId }
  const stateDelta = {
    ...buildTurnStateDelta(p.prevState, p.newState, p.event),
    turnId,
  }
  return { ...base, turnId, stateDelta }
}

export function sendChatDone(
  webContents: WebContents,
  base: Omit<ChatDonePayload, 'stateDelta'>
): void {
  webContents.send('chat:done', enrichChatDonePayload(base.turnId, base))
}
