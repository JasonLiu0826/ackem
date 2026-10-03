import { getDatabase } from '../../db/database.js'
import type { RecallBundle, RecallItem, RecallQuery } from '../contracts.js'
import {
  loadActionCandidates,
  loadEpisodeCandidates,
  loadFactCandidates,
  type RecallCandidate
} from './candidateSources.js'
import { detectRecallIntents } from './recallIntent.js'
import {
  DEFAULT_RECALL_RANKER_POLICY,
  rankCandidates,
  type RecallRankerPolicy
} from './recallRanker.js'
import { emptyRecallTrace, finalizeRecallTrace } from './recallTrace.js'

export type ComposeRecallOptions = {
  policy?: RecallRankerPolicy
}

function bucketItems(
  intents: ReturnType<typeof detectRecallIntents>,
  items: RecallItem[]
): Pick<
  RecallBundle,
  'currentActions' | 'reliableFacts' | 'relevantEpisodes' | 'temporalContext' | 'uncertain'
> {
  const currentActions: RecallItem[] = []
  const reliableFacts: RecallItem[] = []
  const relevantEpisodes: RecallItem[] = []
  const temporalContext: RecallItem[] = []
  const uncertain: RecallItem[] = []

  for (const item of items) {
    if (item.source === 'action') {
      if (intents.includes('task_progress') || intents.includes('plugin_result')) {
        currentActions.push(item)
      } else {
        uncertain.push(item)
      }
      continue
    }
    if (item.source === 'fact') {
      if (intents.includes('explicit_recall')) {
        reliableFacts.push(item)
      } else if (intents.includes('user_preference') || intents.includes('general')) {
        reliableFacts.push(item)
      } else if (intents.includes('episode_time')) {
        temporalContext.push(item)
      } else {
        reliableFacts.push(item)
      }
      continue
    }
    if (item.source === 'episode') {
      if (intents.includes('episode_time') || intents.includes('general')) {
        relevantEpisodes.push(item)
      } else {
        uncertain.push(item)
      }
      continue
    }
    uncertain.push(item)
  }

  return { currentActions, reliableFacts, relevantEpisodes, temporalContext, uncertain }
}

/** Append only full bullet lines so budget never cuts mid-fact (Task 12). */
export function buildPromptBlock(
  bundle: Omit<RecallBundle, 'promptBlock' | 'trace'>,
  budgetChars: number
): string {
  const sections: Array<{ title: string; lines: string[] }> = [
    { title: '【运行态】', lines: bundle.currentActions.slice(0, 3).map((i) => `- ${i.text}`) },
    { title: '【可靠事实】', lines: bundle.reliableFacts.slice(0, 5).map((i) => `- ${i.text}`) },
    { title: '【相关经历】', lines: bundle.relevantEpisodes.slice(0, 3).map((i) => `- ${i.text}`) },
    { title: '【时间上下文】', lines: bundle.temporalContext.slice(0, 3).map((i) => `- ${i.text}`) },
    { title: '【待确认】', lines: bundle.uncertain.slice(0, 2).map((i) => `- ${i.text}`) }
  ]

  const out: string[] = []
  let used = 0
  const sep = '\n\n'

  for (const section of sections) {
    if (section.lines.length === 0) continue
    const header = `${section.title}\n`
    const headerCost = out.length === 0 ? header.length : sep.length + header.length
    if (used + headerCost > budgetChars) break

    const blockLines: string[] = [section.title]
    let sectionLen = header.length
    if (out.length > 0) sectionLen += sep.length

    for (const line of section.lines) {
      const lineCost = (blockLines.length > 1 ? 1 : 0) + line.length
      if (used + sectionLen + lineCost > budgetChars) break
      blockLines.push(line)
      sectionLen += lineCost
    }
    if (blockLines.length <= 1) continue

    if (out.length > 0) {
      out.push('')
      used += sep.length
    }
    const body = blockLines.join('\n')
    out.push(body)
    used += body.length
  }

  return out.join('\n\n')
}

function softDeadlineExceeded(started: number, deadlineMs: number): boolean {
  if (deadlineMs <= 0) return true
  return Date.now() - started > deadlineMs
}

export async function composeRecall(
  dataRoot: string,
  query: RecallQuery,
  opts: ComposeRecallOptions = {}
): Promise<RecallBundle> {
  const started = Date.now()
  const db = getDatabase(dataRoot)
  if (!db) {
    return {
      currentActions: [],
      reliableFacts: [],
      relevantEpisodes: [],
      temporalContext: [],
      uncertain: [],
      promptBlock: '',
      trace: emptyRecallTrace(['db_unavailable'])
    }
  }

  const policy = opts.policy ?? DEFAULT_RECALL_RANKER_POLICY
  const intents = detectRecallIntents(query.text)
  const degraded: string[] = []
  let deadlineExceeded = false

  const tLoad = Date.now()
  const candidates: RecallCandidate[] = []

  candidates.push(...loadActionCandidates(db, query, intents))
  if (softDeadlineExceeded(started, query.deadlineMs)) {
    deadlineExceeded = true
    degraded.push('deadline_soft_limit')
  } else {
    candidates.push(...loadFactCandidates(dataRoot, query, intents, db))
    if (softDeadlineExceeded(started, query.deadlineMs)) {
      deadlineExceeded = true
      degraded.push('deadline_soft_limit')
    } else {
      candidates.push(...loadEpisodeCandidates(dataRoot, query, db))
    }
  }

  const loadMs = Date.now() - tLoad
  if (Date.now() - started > query.deadlineMs && query.deadlineMs > 0) {
    deadlineExceeded = true
    if (!degraded.includes('deadline_soft_limit')) degraded.push('deadline_soft_limit')
  }

  const candidateCounts = {
    action: candidates.filter((c) => c.source === 'action').length,
    fact: candidates.filter((c) => c.source === 'fact').length,
    episode: candidates.filter((c) => c.source === 'episode').length
  }

  const tRank = Date.now()
  const { items, filtered } = rankCandidates(candidates, intents, policy, query.sessionId, query)
  const rankMs = Date.now() - tRank

  const buckets = bucketItems(intents, items)
  const promptBlock = buildPromptBlock(buckets, query.budgetChars)
  const trace = finalizeRecallTrace(started, intents, candidateCounts, items, filtered, degraded, {
    loadMs,
    rankMs,
    deadlineExceeded
  })

  return {
    ...buckets,
    promptBlock,
    trace
  }
}
