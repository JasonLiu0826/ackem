export function pickRecallFact(facts: string[], habitLines: string[] = []): string | null {
  const pool = [
    ...habitLines.map((h) => `【习惯】${h.trim()}`),
    ...facts.map((f) => f.trim()).filter(Boolean)
  ]
  if (!pool.length) return null
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx] ?? null
}

export function buildRecallLine(fact: string): string {
  if (fact.startsWith('【习惯】')) {
    const habit = fact.replace(/^【习惯】/, '').trim()
    return `想起你养成的习惯：「${habit.slice(0, 80)}」——今天还这样吗？`
  }
  return `突然想到，你之前说过「${fact.slice(0, 80)}」——还记得吗？`
}

/** 测试可固定随机 */
export function shouldAttemptRecall(seed: number): boolean {
  if (process.env.ACKEM_AMBIENT_RECALL_ALWAYS === '1') return true
  return seed % 5 === 0
}
