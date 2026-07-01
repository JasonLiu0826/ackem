import { stripChannelControlTags } from '../../../../channels/channelControlTags'

/** 主动骚扰模式：每次发送后随机等待 1 / 2 / 4 / 10 分钟 */
export const COMPANION_HARASS_DELAY_MS = [
  60_000,
  2 * 60_000,
  4 * 60_000,
  10 * 60_000
] as const

export function pickCompanionHarassDelayMs(rng: () => number = Math.random): number {
  const idx = Math.floor(rng() * COMPANION_HARASS_DELAY_MS.length)
  return COMPANION_HARASS_DELAY_MS[idx] ?? COMPANION_HARASS_DELAY_MS[0]
}

/** 通知正文：取首条气泡并限制长度 */
export function notificationBodyFromProactiveMessage(message: string, maxChars = 120): string {
  const first = message.split(/\[SPLIT\]/i)[0]?.trim() ?? message.trim()
  const cleaned = stripChannelControlTags(first)
  if (cleaned.length <= maxChars) return cleaned
  return `${cleaned.slice(0, maxChars - 1)}…`
}
