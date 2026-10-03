export type MemoryAuditMetrics = {
  recallP95Ms?: number
  transactionP95Ms?: number
  jobBacklog: number
  deadJobs: number
  /** Legacy chat JSON repairs after DB-authoritative chat deletes. */
  projectionRepairCount: number
  governanceDeleteCount: number
  /** Action runtime reconcile jobs completed (Task 16 observability). */
  reconcileCount: number
}

export type PermanentDeleteImpact = {
  targetKind: 'fact' | 'episode'
  targetId: string
  invalidated: { facts: number; episodes: number; embeddings: number; associations: number }
}
