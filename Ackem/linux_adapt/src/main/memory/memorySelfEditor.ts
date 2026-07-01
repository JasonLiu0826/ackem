// [memorySelfEditor] — 记忆自编辑
// 职责：批量矛盾检测+自主更新/合并/退役事实，记录编辑日志
// 对标 MemGPT self-editing memory
// 引用：../engine/types, ./factStore, ./contradictionDetector

import { SELF_EDIT_LOG_KEEP, SELF_EDIT_LOG_MAX, SELF_EDIT_REINFORCE_WEIGHT_BOOST } from '../engine/ackemParams'
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
   * 批量检查多条新事实与相似已有事实，一次 LLM 调用完成所有判断
   */
  async batchResolve(
    pairs: Array<{ newFact: MemoryFact; existing: MemoryFact }>,
    factStore: FactStore,
    llm: LlmClient
  ): Promise<string[]> {
    const results: string[] = []
    const validPairs = pairs.filter(p => p.newFact.id !== p.existing.id && p.newFact.factLayer !== 'consolidated')
    if (validPairs.length === 0) return results

    // 批量送检：2+ 对 → 一次 LLM 调用；1 对 → 单独调用
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
      return `强化并合并：${check.reason}`
    }

    if (check.judgment === 'conflict') {
      if (check.action === 'keep_new') {
        factStore.retireFact(existing.id)
        this.log('retire_old_conflict', existing.id, newFact.id, check.reason)
        return `退役旧事实（冲突，保留新）：${check.reason}`
      }
      if (check.action === 'keep_old') {
        factStore.retireFact(newFact.id)
        this.log('retire_new_conflict', newFact.id, existing.id, check.reason)
        return `退役新事实（冲突，保留旧）：${check.reason}`
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
        return `合并冲突事实：${check.reason}`
      }
      if (check.action === 'flag') {
        this.log('flag', newFact.id, existing.id, check.reason)
        return `标记为需人工确认：${check.reason}`
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
