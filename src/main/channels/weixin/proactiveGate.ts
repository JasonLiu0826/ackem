import {
  getLastDesktopAckemActivityMs,
  getLastProactiveSentMs,
  getLastWeixinAckemActivityMs
} from './activity'

export const PROACTIVE_IDLE_MS = 3 * 60 * 60 * 1000
export const PROACTIVE_COOLDOWN_MS = 3 * 60 * 60 * 1000

/** 8:00锛堝惈锛夛綖 22:00锛堜笉鍚級鍙彂锛?2:00锝炴鏃?8:00 涓虹潯瑙夊尯闂?*/
export function isWeixinProactiveAwakeWindow(now = new Date()): boolean {
  const h = now.getHours()
  return h >= 8 && h < 22
}

export type ProactiveGateResult =
  | { ok: true }
  | { ok: false; reason: string }

export function evaluateWeixinProactiveGate(
  dataRoot: string,
  now = new Date()
): ProactiveGateResult {
  if (!isWeixinProactiveAwakeWindow(now)) {
    return { ok: false, reason: 'sleep_hours' }
  }

  const nowMs = now.getTime()
  const desktopMs = getLastDesktopAckemActivityMs(dataRoot)
  const weixinMs = getLastWeixinAckemActivityMs(dataRoot)

  if (desktopMs == null || nowMs - desktopMs < PROACTIVE_IDLE_MS) {
    return { ok: false, reason: 'desktop_active_recently' }
  }
  if (weixinMs == null || nowMs - weixinMs < PROACTIVE_IDLE_MS) {
    return { ok: false, reason: 'weixin_active_recently' }
  }

  const lastSent = getLastProactiveSentMs(dataRoot)
  if (lastSent != null && nowMs - lastSent < PROACTIVE_COOLDOWN_MS) {
    return { ok: false, reason: 'proactive_cooldown' }
  }

  return { ok: true }
}
