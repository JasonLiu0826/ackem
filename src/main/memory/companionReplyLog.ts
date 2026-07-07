import type { EmotionState, L1State } from '../engine/types'
import type { KnowledgeGraph } from './knowledgeGraph'
import type { FactStore } from './factStore'
import { writeFactRows } from './factLanding'
import type { ExtractedFactRow } from './lightExtract/types'
import type { AdultMemoryPrivacyLevel } from '../prompt/adult-mode'

const COMPANION_REPLY_SUBJECT_PREFIX = 'Ackem鍥炲'
const DAILY_SUMMARY_MAX_CHARS = 2400
const REPLY_LINE_MAX_CHARS = 220

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}鈥
}

/** 6鏈?2鏃?1鐐?0鍒?*/
export function formatReplyTimestamp(d: Date): string {
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  const minute = d.getMinutes()
  if (minute === 0) return `${month}鏈?{day}鏃?{hour}鐐筦
  return `${month}鏈?{day}鏃?{hour}鐐?{minute}鍒哷
}

/** 鎸?session + 鏃ュ巻鏃ュ悎骞朵即渚ｅ洖澶嶆憳瑕?*/
export function companionReplySubjectForDay(d: Date): string {
  return `${COMPANION_REPLY_SUBJECT_PREFIX}路${d.toISOString().slice(0, 10)}`
}

export function formatCompanionReplyLine(
  userMsg: string,
  assistantText: string,
  now = new Date()
): string {
  const userQ = clip(userMsg, 48)
  const body = clip(assistantText, 160)
  return `${formatReplyTimestamp(now)}锛屽洖澶嶇敤鎴枫€?{userQ}銆嶏細${body}`
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
    triggers: ['Ackem鍥炲'],
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

/** 姣忚疆鍚屾鍐欏叆浼翠荆鍥炲鎽樿锛堝悓 session 鍚屾棩鍚堝苟涓轰竴鏉★級 */
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
