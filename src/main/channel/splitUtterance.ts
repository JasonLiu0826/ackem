const SPLIT_RE = /(?:[，,]\s*)?(?:另外|顺便|然后|以及|还有一件|还有就是|and then|also)\s*/

export function splitUtterance(text: string): string[] | null {
  const t = text.trim()
  if (!t || !/(?:另外|顺便|然后|以及|还有一件|还有就是|and then|\balso\b)/i.test(t)) return null
  const parts = t
    .split(SPLIT_RE)
    .map((s) => s.replace(/^[，,]\s*/, '').trim())
    .filter((s) => s.length >= 2)
  return parts.length >= 2 ? parts.slice(0, 3) : null
}

export function isActionablePlan(plan: { channel: string; pendingConfirm?: string }): boolean {
  return plan.channel === 'plugin' || plan.channel === 'work' || Boolean(plan.pendingConfirm)
}
