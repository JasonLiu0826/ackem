function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isWithinActiveHours(activeHours: string | undefined, now: Date): boolean {
  if (!activeHours) return true
  const [startStr, endStr] = activeHours.split('-')
  if (!startStr || !endStr) return true
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const start = parseMinutes(startStr)
  const end = parseMinutes(endStr)
  if (start <= end) {
    return nowMin >= start && nowMin <= end
  }
  return nowMin >= start || nowMin <= end
}

export function messageMatchesKeywords(message: string, keywords: string[]): boolean {
  const normalized = message.toLowerCase()
  return keywords.some((kw) => normalized.includes(kw.toLowerCase()))
}
