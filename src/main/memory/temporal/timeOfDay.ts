/** 与 desktop-companion 时段划分一致，供记忆链按 IANA 小时推导 timeOfDay。 */
export type TimeOfDay =
  | 'morning'
  | 'forenoon'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night'

export function deriveTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 8) return 'morning'
  if (hour >= 8 && hour < 11) return 'forenoon'
  if (hour >= 11 && hour < 14) return 'afternoon'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  if (hour >= 22 || hour < 2) return 'night'
  return 'late_night'
}

export function formatLocalTimeHHMM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
