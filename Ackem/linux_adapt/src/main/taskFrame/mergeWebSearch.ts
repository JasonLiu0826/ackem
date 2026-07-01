// [taskFrame/mergeWebSearch] — 多对象 / 多 tool call 搜索合并策略

import type { UserTaskFrame } from '../../shared/taskFrame'

export type WebSearchExecutionPlan = {
  /** 首选 query（Task Frame 优先；意图澄清前兜底） */
  query: string
  /** 交给 resolveSearchIntent 的全部候选 */
  candidateQueries: string[]
  /** 合并后只执行一次，忽略其余 web_search tool call */
  singleShot: boolean
}

function uniqueQueries(queries: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of queries) {
    const t = q.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * 决定本轮 web_search 如何执行。
 * Task Frame searchQuery 始终优先；候选列表供意图澄清使用。
 */
export function planWebSearchExecution(
  taskFrame: UserTaskFrame | undefined,
  toolCallQueries: string[]
): WebSearchExecutionPlan | null {
  const queries = uniqueQueries(toolCallQueries)
  const frameQuery = taskFrame?.searchQuery?.trim()

  if (queries.length === 0 && !frameQuery) return null

  const shouldMerge =
    taskFrame?.mergeWebSearch === true ||
    queries.length > 1 ||
    (taskFrame?.subjects?.length ?? 0) >= 2

  const allCandidates = uniqueQueries(frameQuery ? [frameQuery, ...queries] : queries)

  if (frameQuery) {
    return { query: frameQuery, candidateQueries: allCandidates, singleShot: true }
  }

  if (queries.length === 0) return null

  if (shouldMerge) {
    const merged = queries.join(' ')
    return { query: merged, candidateQueries: allCandidates, singleShot: true }
  }

  return {
    query: queries[0],
    candidateQueries: allCandidates,
    singleShot: queries.length === 1
  }
}
