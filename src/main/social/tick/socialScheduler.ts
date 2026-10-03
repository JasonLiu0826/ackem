import { SOCIAL } from '../types'
import { getSocialSettings } from '../settings'
import { runSocialTick } from './runSocialTick'

const timers = new Map<string, ReturnType<typeof setInterval>>()

export function startSocialTick(dataRoot: string, tickMs?: number): void {
  stopSocialTick(dataRoot)
  const ms = tickMs ?? getSocialSettings(dataRoot).tickMs ?? SOCIAL.TICK_MS
  const handle = setInterval(() => {
    void runSocialTick(dataRoot).catch(() => {
      /* tick errors must not crash main */
    })
  }, ms)
  // Prevent keeping process alive in tests/Electron exit
  if (typeof handle.unref === 'function') handle.unref()
  timers.set(dataRoot, handle)
}

export function stopSocialTick(dataRoot: string): void {
  const handle = timers.get(dataRoot)
  if (handle) {
    clearInterval(handle)
    timers.delete(dataRoot)
  }
}

export function isSocialTickRunning(dataRoot: string): boolean {
  return timers.has(dataRoot)
}
