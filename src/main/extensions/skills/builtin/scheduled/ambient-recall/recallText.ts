export function pickRecallFact(facts: string[], habitLines: string[] = []): string | null {
  const pool = [
    ...habitLines.map((h) => `銆愪範鎯€?{h.trim()}`),
    ...facts.map((f) => f.trim()).filter(Boolean)
  ]
  if (!pool.length) return null
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx] ?? null
}

export function buildRecallLine(fact: string): string {
  if (fact.startsWith('銆愪範鎯€?)) {
    const habit = fact.replace(/^銆愪範鎯€?, '').trim()
    return `鎯宠捣浣犲吇鎴愮殑涔犳儻锛氥€?{habit.slice(0, 80)}銆嶁€斺€斾粖澶╄繕杩欐牱鍚楋紵`
  }
  return `绐佺劧鎯冲埌锛屼綘涔嬪墠璇磋繃銆?{fact.slice(0, 80)}銆嶁€斺€旇繕璁板緱鍚楋紵`
}

/** 娴嬭瘯鍙浐瀹氶殢鏈?*/
export function shouldAttemptRecall(seed: number): boolean {
  if (process.env.Ackem_AMBIENT_RECALL_ALWAYS === '1') return true
  return seed % 5 === 0
}
