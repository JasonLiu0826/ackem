/**
 * Route v2 阶段 2-0 — Miss Ledger read-only census (设计 §6.2).
 *
 * Counts the five reverse-example signal classes from the ledger so the mine
 * pipeline can be sized against real data. READS ONLY — never writes, never
 * mutates routing behaviour.
 *
 * Signals (设计 §6.2):
 *  S1 卡被拒绝      — plan.rejected events
 *  S2 聊天内纠正    — memory.corrected events ( wired when 记忆 Task 13 ships )
 *  S3 同意图改口    — a chat.user_message turn followed (same session) by a
 *                     later plan.accepted whose turn's user text differs from
 *                     the earlier chat-only turn (approximation: earlier turn
 *                     got a chat verdict, later turn a card that was accepted)
 *  S4 探针升格被接受 — plan.accepted on turns whose verdict usedClassifier
 *                     (阶段 3 探针上线前恒空, 留接口)
 *  S5 缺口转化      — gap verdicts (motive 缺口两击) reaching work.succeeded
 */

import type Database from 'better-sqlite3'

export type MissLedgerCensus = {
  windowStart: string
  windowEnd: string
  /** S1 卡被拒绝: plan.rejected with the proposing turn's id. */
  rejectedCards: Array<{ turnId: string; planId: string; observedAt: string }>
  /** S2 聊天内纠正: memory.corrected (empty until 记忆 Task 13 wires control). */
  corrections: Array<{ eventId: string; observedAt: string }>
  /** S3 同意图改口: chat-verdict turn → later accepted card in same session. */
  rephrasePairs: Array<{
    sessionId: string
    chatTurnId: string
    acceptedTurnId: string
  }>
  /** S4 探针升格被接受 (阶段 3 前恒空). */
  probeAccepted: Array<{ turnId: string; planId: string }>
  /** S5 缺口转化: 缺口说法 → factory 卡 → work succeeded. */
  gapConversions: Array<{ turnId: string; runtimeId: string | null }>
  totals: {
    rejectedCards: number
    corrections: number
    rephrasePairs: number
    probeAccepted: number
    gapConversions: number
  }
}

export function censusMissLedger(
  db: Database.Database,
  windowStart: string,
  windowEnd: string
): MissLedgerCensus {
  // S1 卡被拒绝
  const rejectedCards = (
    db
      .prepare(
        `SELECT turn_id, json_extract(p.content_json,'$.planId') as plan_id, observed_at
         FROM memory_events e
         JOIN memory_event_payloads p ON p.event_id = e.event_id
         WHERE e.event_type = 'plan.rejected'
           AND e.observed_at >= ? AND e.observed_at < ?`
      )
      .all(windowStart, windowEnd) as Array<{
      turn_id: string | null
      plan_id: string | null
      observed_at: string
    }>
  ).map((r) => ({
    turnId: r.turn_id ?? '',
    planId: r.plan_id ?? '',
    observedAt: r.observed_at
  }))

  // S2 聊天内纠正 — memory.corrected lands with 记忆 Task 13.
  const corrections = (
    db
      .prepare(
        `SELECT event_id, observed_at FROM memory_events
         WHERE event_type = 'memory.corrected'
           AND observed_at >= ? AND observed_at < ?`
      )
      .all(windowStart, windowEnd) as Array<{ event_id: string; observed_at: string }>
  ).map((r) => ({ eventId: r.event_id, observedAt: r.observed_at }))

  // S3 同意图改口: per session, a turn whose verdict was chat (no card) that
  // is followed within the window by a plan.accepted on a different turn.
  const rephraseRows = db
    .prepare(
      `WITH chat_turns AS (
         SELECT v.session_id, v.turn_id AS chat_turn_id, v.observed_at
         FROM memory_events v
         JOIN memory_event_payloads vp ON vp.event_id = v.event_id
         WHERE v.event_type = 'route.verdict'
           AND json_extract(vp.content_json,'$.finalChannel') = 'chat'
           AND json_extract(vp.content_json,'$.pendingConfirm') IS NULL
           AND v.observed_at >= ? AND v.observed_at < ?
       ),
       accepted AS (
         SELECT session_id, turn_id AS accepted_turn_id, observed_at
         FROM memory_events
         WHERE event_type = 'plan.accepted'
           AND observed_at >= ? AND observed_at < ?
       )
       SELECT c.session_id, c.chat_turn_id, a.accepted_turn_id
       FROM chat_turns c
       JOIN accepted a
         ON a.session_id = c.session_id
        AND a.observed_at > c.observed_at
       GROUP BY c.session_id, c.chat_turn_id, a.accepted_turn_id
       LIMIT 200`
    )
    .all(windowStart, windowEnd, windowStart, windowEnd) as Array<{
    session_id: string
    chat_turn_id: string
    accepted_turn_id: string
  }>
  const rephrasePairs = rephraseRows.map((r) => ({
    sessionId: r.session_id,
    chatTurnId: r.chat_turn_id,
    acceptedTurnId: r.accepted_turn_id
  }))

  // S4 探针升格被接受: accepted cards whose turn verdict carried a probe layer.
  const probeAccepted = (
    db
      .prepare(
        `SELECT DISTINCT v.turn_id,
                json_extract(p2.content_json,'$.planId') as plan_id
         FROM memory_events v
         JOIN memory_event_payloads vp ON vp.event_id = v.event_id
         JOIN memory_events a ON a.turn_id = v.turn_id AND a.event_type = 'plan.accepted'
         JOIN memory_event_payloads p2 ON p2.event_id = a.event_id
         WHERE v.event_type = 'route.verdict'
           AND json_extract(vp.content_json,'$.layers') LIKE '%"probe"%'
           AND v.observed_at >= ? AND v.observed_at < ?`
      )
      .all(windowStart, windowEnd) as Array<{ turn_id: string; plan_id: string | null }>
  ).map((r) => ({ turnId: r.turn_id, planId: r.plan_id ?? '' }))

  // S5 缺口转化: verdicts on turns that ended in work.succeeded, filtered to
  // gap-motive turns (motive recorded by the two-strike gap detector).
  const gapConversions = (
    db
      .prepare(
        `SELECT DISTINCT v.turn_id, r.runtime_id
         FROM memory_events v
         JOIN memory_event_payloads vp ON vp.event_id = v.event_id
         JOIN memory_events w ON w.turn_id = v.turn_id AND w.event_type = 'work.succeeded'
         LEFT JOIN memory_action_runs r ON r.run_id = (
           SELECT run_id FROM memory_action_runs
           WHERE session_id = v.session_id AND nature = 'work'
           ORDER BY updated_at DESC LIMIT 1
         )
         WHERE v.event_type = 'route.verdict'
           AND json_extract(vp.content_json,'$.motive') IN ('none','chat')
           AND json_extract(vp.content_json,'$.pendingConfirm') IN ('create','update')
           AND v.observed_at >= ? AND v.observed_at < ?`
      )
      .all(windowStart, windowEnd) as Array<{ turn_id: string; runtime_id: string | null }>
  ).map((r) => ({ turnId: r.turn_id, runtimeId: r.runtime_id }))

  return {
    windowStart,
    windowEnd,
    rejectedCards,
    corrections,
    rephrasePairs,
    probeAccepted,
    gapConversions,
    totals: {
      rejectedCards: rejectedCards.length,
      corrections: corrections.length,
      rephrasePairs: rephrasePairs.length,
      probeAccepted: probeAccepted.length,
      gapConversions: gapConversions.length
    }
  }
}
