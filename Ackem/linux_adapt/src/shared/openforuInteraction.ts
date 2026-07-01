/** OpenForU OID — 交互验收剧本（Design Spec ↔ verifyInteraction） */

export type InteractionOp = 'invoke' | 'click' | 'assertState' | 'wait'

export type InteractionStep = {
  op: InteractionOp
  /** invoke/click 目标：按钮文案或 action 名 */
  target?: string
  expect?: Record<string, unknown>
  timeoutMs?: number
  waitMs?: number
}

export type InteractionRequiredLevel = 'L0' | 'L1' | 'L2'

export function buildInteractionScriptForWidget(
  widgetId: string,
  primaryActions: string[]
): InteractionStep[] {
  const start =
    primaryActions.find((a) => /开始|start|专注/i.test(a)) ?? primaryActions[0] ?? '开始'
  const reset =
    primaryActions.find((a) => /重置|reset|停止/i.test(a)) ?? primaryActions[1] ?? '重置'

  switch (widgetId) {
    case 'timer.pomodoro':
    case 'timer.countdown':
      return [
        { op: 'invoke', target: start },
        { op: 'assertState', expect: { running: true } },
        { op: 'invoke', target: reset },
        { op: 'assertState', expect: { running: false } }
      ]
    case 'counter.simple':
      return [
        { op: 'invoke', target: primaryActions.find((a) => /\+|加|增/i.test(a)) ?? '+' },
        { op: 'assertState', expect: { count: 1 } },
        { op: 'invoke', target: reset }
      ]
    case 'checklist.basic':
      return [{ op: 'assertState', expect: { itemCount: 1 } }]
    default:
      if (primaryActions.length >= 2) {
        return [
          { op: 'invoke', target: start },
          { op: 'invoke', target: reset }
        ]
      }
      return [{ op: 'invoke', target: start }]
  }
}

/** 浅比较 state 是否满足 expect（仅顶层键） */
export function stateMatchesExpect(
  state: Record<string, unknown> | null | undefined,
  expect: Record<string, unknown>
): boolean {
  if (!state) return false
  for (const [k, v] of Object.entries(expect)) {
    if (state[k] !== v) return false
  }
  return true
}
