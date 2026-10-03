import type { MemoryEvent } from '../contracts.js'

const SUMMARY_STOP = /^(用户|我|本人)/u

type Polarity = 'like' | 'dislike'

type PreferenceClaim = { object: string; polarity: Polarity }

function normalizeObject(raw: string): string {
  return raw.replace(/[，。！？、；：\s"'「」『』（）()[\]{}]/gu, '').trim()
}

/** Tokens from a clause that must appear in user text (non-preference claims). */
export function groundingTermsFromSummary(summary: string): string[] {
  let stripped = summary.replace(SUMMARY_STOP, '')
  for (let i = 0; i < 3; i++) {
    const next = stripped.replace(/^(偏好|喜欢|爱|讨厌|习惯|经常|平时|住在|来自)\s*/u, '')
    if (next === stripped) break
    stripped = next
  }
  stripped = stripped.replace(/[，。！？、；：\s"'「」『』（）()[\]{}]/gu, ' ')
  const terms: string[] = []
  const runs = stripped.match(/[\u4e00-\u9fff]{2,}|[A-Za-z0-9]{2,}/g) ?? []
  for (const r of runs) {
    const t = r.trim()
    if (t.length >= 2) terms.push(t)
  }
  return terms
}

function splitSummaryClauses(summary: string): string[] {
  return summary
    .split(/[，。；;]/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

function extractPreferenceFromClause(clause: string): PreferenceClaim | null {
  const dislike = clause.match(/(?:用户|我|本人)?(?:不喜欢|讨厌|不爱)(.+)/u)
  if (dislike?.[1]) {
    const object = normalizeObject(dislike[1])
    if (object) return { object, polarity: 'dislike' }
  }
  if (/不喜欢|讨厌|不爱/u.test(clause)) return null
  const like = clause.match(/(?:用户|我|本人)?(?:喜欢|爱)(.+)/u)
  if (like?.[1]) {
    const object = normalizeObject(like[1])
    if (object) return { object, polarity: 'like' }
  }
  return null
}

function extractPreferencesFromUserText(userText: string): PreferenceClaim[] {
  const out: PreferenceClaim[] = []
  for (const clause of splitSummaryClauses(userText)) {
    const pref = extractPreferenceFromClause(clause)
    if (pref) out.push(pref)
  }
  if (out.length === 0) {
    const pref = extractPreferenceFromClause(userText.trim())
    if (pref) out.push(pref)
  }
  return out
}

function objectsAlign(summaryObject: string, userObject: string): boolean {
  const a = normalizeObject(summaryObject)
  const b = normalizeObject(userObject)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

function nonPreferenceClauseSupported(clause: string, userText: string): boolean {
  const terms = groundingTermsFromSummary(clause)
  if (terms.length === 0) return false
  return terms.every((t) => userText.includes(t))
}

function preferenceClauseSupported(clause: string, userText: string): boolean {
  const claim = extractPreferenceFromClause(clause)
  if (!claim) return nonPreferenceClauseSupported(clause, userText)
  const userPrefs = extractPreferencesFromUserText(userText)
  return userPrefs.some((u) => objectsAlign(claim.object, u.object) && u.polarity === claim.polarity)
}

/** Every summary clause must be supported; preference polarity must match user wording. */
export function isSummaryFullyGroundedInUserText(summary: string, userText: string): boolean {
  const clauses = splitSummaryClauses(summary)
  if (clauses.length === 0) return false
  const hay = userText.trim()
  if (!hay) return false
  for (const clause of clauses) {
    const pref = extractPreferenceFromClause(clause)
    if (pref) {
      if (!preferenceClauseSupported(clause, hay)) return false
    } else if (!nonPreferenceClauseSupported(clause, hay)) {
      return false
    }
  }
  return true
}

/** @deprecated alias */
export function isSummaryGroundedInUserText(summary: string, userText: string): boolean {
  return isSummaryFullyGroundedInUserText(summary, userText)
}

export function userTextFromChatEvent(ev: MemoryEvent): string {
  const c = ev.payload.content
  if (typeof c.userText === 'string') return c.userText
  if (typeof c.text === 'string') return c.text
  return ev.payload.summary
}

export function isUserChatEvidenceEvent(ev: MemoryEvent): boolean {
  return ev.meta.nature === 'chat' && ev.meta.eventType === 'chat.user_message'
}

export function assertDraftsGroundedInUserEvidence(
  drafts: Array<{ summary: string; evidenceEventIds: string[] }>,
  contextEvents: MemoryEvent[]
): void {
  const byId = new Map(contextEvents.map((e) => [e.meta.eventId, e]))
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!
    if (d.evidenceEventIds.length === 0) {
      throw new Error(`draft[${i}] missing evidenceEventIds`)
    }
    const userTexts: string[] = []
    for (const id of d.evidenceEventIds) {
      const ev = byId.get(id)
      if (!ev || !isUserChatEvidenceEvent(ev)) {
        throw new Error(`draft[${i}] evidence must be chat.user_message`)
      }
      userTexts.push(userTextFromChatEvent(ev))
    }
    const combined = userTexts.join('\n')
    if (!isSummaryFullyGroundedInUserText(d.summary, combined)) {
      throw new Error(`draft[${i}] summary not grounded in cited user text`)
    }
  }
}
