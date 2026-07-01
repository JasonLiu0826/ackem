/** Pad month/day to MM-DD */
export function formatBirthdayMMDD(month: number, day: number): string {
  const m = Math.min(12, Math.max(1, month))
  const d = Math.min(31, Math.max(1, day))
  return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function calendarSuffix(text: string): string {
  if (/阴历|农历/.test(text)) return '（阴历）'
  if (/阳历|公历/.test(text)) return '（阳历）'
  return ''
}
