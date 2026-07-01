import type { EmotionState, L1State } from '../engine/types'
import type { KnowledgeGraph } from './knowledgeGraph'
import type { FactStore } from './factStore'
import { writeFactRows } from './factLanding'
import type { ExtractedFactRow } from './lightExtract/types'
import type { AdultMemoryPrivacyLevel } from '../prompt/adult-mode'

const COMPANION_REPLY_SUBJECT_PREFIX = 'Ackem回复'
const DAILY_SUMMARY_MAX_CHARS = 2400
const REPLY_LINE_MAX_CHARS = 220

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** 6月22日21点30分 */
export function formatReplyTimestamp(d: Date): string {
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  const minute = d.getMinutes()
  if (minute === 0) return `${month}月${day}日${hour}点`
  return `${month}月${day}日${hour}点${minute}分`
}

/** 按 session + 日历日合并伴侣回复摘要 */
export function companionReplySubjectForDay(d: Date): string {
  return `${COMPANION_REPLY_SUBJECT_PREFIX}·${d.toISOString().slice(0, 10)}`
}

export function formatCompanionReplyLine(
  userMsg: string,
  assistantText: string,
  now = new Date()
): string {
  const userQ = clip(userMsg, 48)
  const body = clip(assistantText, 160)
  return `${formatReplyTimestamp(now)}，回复用户「${userQ}」：${body}`
}

export function buildCompanionReplyRow(
  userMsg: string,
  assistantText: string,
  now = new Date()
): ExtractedFactRow | null {
  const reply = assistantText.trim()
  if (!reply) return null

  return {
    domain: 'SOCIAL',
    subcategory: 'OUR_BOND',
    subject: companionReplySubjectForDay(now),
    summary: formatCompanionReplyLine(userMsg, reply, now),
    weight: 0.6,
    confidence: 1,
    triggers: ['Ackem回复'],
  }
}

function findDailyCompanionReply(
  store: FactStore,
  sessionId: string,
  subject: string
): { id: string; summary: string } | null {
  store.load()
  const hit = store
    .listActive()
    .find(
      (f) =>
        f.subcategory === 'OUR_BOND' &&
        f.subject === subject &&
        f.sourceSessionId === sessionId
    )
  return hit ? { id: hit.id, summary: hit.summary } : null
}

/** 每轮同步写入伴侣回复摘要（同 session 同日合并为一条） */
export function writeCompanionReplyLog(args: {
  dataRoot: string
  sessionId: string
  turnIndex: number
  userMsg: string
  assistantText: string
  l1: L1State
  l2: EmotionState
  store: FactStore
  kg?: KnowledgeGraph
  adultPrivacyLevel?: AdultMemoryPrivacyLevel
}): string[] {
  const now = new Date()
  const line = formatCompanionReplyLine(args.userMsg, args.assistantText, now)
  if (!line) return []

  const subject = companionReplySubjectForDay(now)
  const existing = findDailyCompanionReply(args.store, args.sessionId, subject)

  if (existing) {
    const merged = clip(`${existing.summary}\n${line}`, DAILY_SUMMARY_MAX_CHARS)
    args.store.updateFact(existing.id, { summary: merged, privacyLevel: args.adultPrivacyLevel ?? 'normal' })
    return [existing.id]
  }

  const row = buildCompanionReplyRow(args.userMsg, args.assistantText, now)
  if (!row) return []

  const { newFactIds } = writeFactRows({
    dataRoot: args.dataRoot,
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    userMsg: args.userMsg,
    rows: [row],
    l1: args.l1,
    l2: args.l2,
    store: args.store,
    kg: args.kg,
    adultPrivacyLevel: args.adultPrivacyLevel,
  })

  return newFactIds
}
