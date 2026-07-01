import { broadcastToRenderers } from '../../../../../rendererBroadcast'

export type ScreenFxEffect = 'pulse'

export type ScreenFxPulseResult = {
  ok: boolean
  effect: ScreenFxEffect
  ms: number
  /** FIX-028：始终 stub，直至 W8 粒子实装 */
  implementationStatus: 'stub'
  channel: 'ui:screenFx'
}

/** W5 Stub：广播 pulse，渲染端可订阅；非满屏粒子 */
export function pulseScreenFx(ms = 1200): ScreenFxPulseResult {
  broadcastToRenderers('ui:screenFx', { effect: 'pulse', ms, implementationStatus: 'stub' })
  return {
    ok: true,
    effect: 'pulse',
    ms,
    implementationStatus: 'stub',
    channel: 'ui:screenFx'
  }
}
