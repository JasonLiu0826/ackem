import { join } from 'node:path'
import { FactStore, defaultFactsPath } from '../memory/factStore'
import type { TemporalFactRef } from './planDateWindow'

/** 从事实库加载 PLANS / COMMITMENTS（CTX-B） */
export function loadTemporalFactsFromDataRoot(dataRoot: string): TemporalFactRef[] {
  const store = new FactStore(defaultFactsPath(dataRoot))
  store.load()
  return store
    .listActive()
    .filter((f) => f.subcategory === 'PLANS' || f.subcategory === 'COMMITMENTS')
    .map((f) => ({ subcategory: f.subcategory, summary: f.summary }))
}

export function temporalFactsPath(dataRoot: string): string {
  return join(dataRoot, 'memory', 'facts', 'facts.v2.json')
}
