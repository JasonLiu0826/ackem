// [memorySelfEditor] 鈥?璁板繂鑷紪杈?
// 鑱岃矗锛氭壒閲忕煕鐩炬娴?鑷富鏇存柊/鍚堝苟/閫€褰逛簨瀹烇紝璁板綍缂栬緫鏃ュ織
// 瀵规爣 MemGPT self-editing memory
// 寮曠敤锛?./engine/types, ./factStore, ./contradictionDetector

import { SELF_EDIT_LOG_KEEP, SELF_EDIT_LOG_MAX, SELF_EDIT_REINFORCE_WEIGHT_BOOST } from '../engine/AckemParams'
import type { ContradictionCheck, LlmClient, MemoryFact } from '../engine/types'
import type { FactStore } from './factStore'
import { ContradictionDetector } from './contradictionDetector'

export type EditLogEntry = {
  at: string
  action: string
  targetFactId: string
  relatedFactId?: string
  reason: string
}

export class MemorySelfEditor {
  private detector = new ContradictionDetector()
  private editLog: EditLogEntry[] = []

  /**
   * 鎵归噺妫€鏌ュ鏉℃柊浜嬪疄涓庣浉浼煎凡鏈変簨瀹烇紝涓€娆?LLM 璋冪敤瀹屾垚鎵€鏈夊垽鏂?
   */
  async batchResolve(
    pairs: Array<{ newFact: MemoryFact; existing: MemoryFact }>,
    factStore: FactStore,
    llm: LlmClient
  ): Promise<string[]> {
    const results: string[] = []
    const validPairs = pairs.filter(p => p.newFact.id !== p.existing.id && p.newFact.factLayer !== 'consolidated')
    if (validPairs.length === 0) return results

    // 鎵归噺閫佹锛?+ 瀵?鈫?涓€娆?LLM 璋冪敤锛? 瀵?鈫?鍗曠嫭璋冪敤
    let checks: Array<{ check: ContradictionCheck; pair: typeof validPairs[0] }> = []
    if (validPairs.length >= 2) {
      const batchResults = await this.detector.checkBatch(validPairs, llm)
      for (const { pair, check } of batchResults) {
        if (check) checks.push({ check, pair })
      }
    } else {
      for (const pair of validPairs) {
        const check = await this.detector.check(pair.newFact, pair.existing, llm)
        if (check) checks.push({ check, pair })
      }
    }

    factStore.load()
    for (const { check, pair } of checks) {
      const result = this.applyResolution(check, pair.newFact, pair.existing, factStore)
      if (result) results.push(result)
    }
    return results
  }

  private applyResolution(
    check: ContradictionCheck,
    newFact: MemoryFact,
    existing: MemoryFact,
    factStore: FactStore
  ): string | null {
    if (check.judgment === 'reinforce') {
      factStore.updateFact(existing.id, {
        summary: newFact.summary.length > existing.summary.length ? newFact.summary : existing.summary,
        weight: Math.max(existing.weight, newFact.weight) + SELF_EDIT_REINFORCE_WEIGHT_BOOST
      })
      factStore.retireFact(newFact.id)
      this.log('merge_reinforce', newFact.id, existing.id, check.reason)
      return `寮哄寲骞跺悎骞讹細${check.reason}`
    }

    if (check.judgment === 'conflict') {
      if (check.action === 'keep_new') {
        factStore.retireFact(existing.id)
        this.log('retire_old_conflict', existing.id, newFact.id, check.reason)
        return `閫€褰规棫浜嬪疄锛堝啿绐侊紝淇濈暀鏂帮級锛?{check.reason}`
      }
      if (check.action === 'keep_old') {
        factStore.retireFact(newFact.id)
        this.log('retire_new_conflict', newFact.id, existing.id, check.reason)
        return `閫€褰规柊浜嬪疄锛堝啿绐侊紝淇濈暀鏃э級锛?{check.reason}`
      }
      if (check.action === 'merge') {
        const mergedSummary = newFact.summary.length >= existing.summary.length
          ? newFact.summary : existing.summary
        factStore.updateFact(existing.id, {
          summary: mergedSummary,
          weight: Math.max(existing.weight, newFact.weight)
        })
        factStore.retireFact(newFact.id)
        this.log('merge_conflict', newFact.id, existing.id, check.reason)
        return `鍚堝苟鍐茬獊浜嬪疄锛?{check.reason}`
      }
      if (check.action === 'flag') {
        this.log('flag', newFact.id, existing.id, check.reason)
        return `鏍囪涓洪渶浜哄伐纭锛?{check.reason}`
      }
    }
    return null
  }

  private log(action: string, targetFactId: string, relatedFactId: string | undefined, reason: string): void {
    this.editLog.push({ at: new Date().toISOString(), action, targetFactId, relatedFactId, reason })
    if (this.editLog.length > SELF_EDIT_LOG_MAX) {
      this.editLog = this.editLog.slice(-SELF_EDIT_LOG_KEEP)
    }
  }

  getEditLog(): EditLogEntry[] {
    return [...this.editLog]
  }

  clearLog(): void {
    this.editLog = []
  }
}
