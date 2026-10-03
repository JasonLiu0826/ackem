import type { FactStore } from '../factStore.js'

export type ReplyLogNoiseReport = {
  candidateCount: number
  sampleSubjects: string[]
  recommendation: 'report_only'
}

/** Identify legacy OUR_BOND reply-log facts; report only (no batch delete). */
export function buildReplyLogNoiseReport(store: FactStore, limit = 20): ReplyLogNoiseReport {
  store.load()
  const hits = store
    .listActive()
    .filter((f) => f.subcategory === 'OUR_BOND' && f.subject.startsWith('Ackem回复'))
  return {
    candidateCount: hits.length,
    sampleSubjects: hits.slice(0, limit).map((f) => f.subject),
    recommendation: 'report_only'
  }
}
