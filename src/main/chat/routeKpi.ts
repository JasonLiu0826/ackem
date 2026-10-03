/**
 * Route v2 阶段 1「判决可见」(设计 §11 / Codex 签收范围): turn a recorded
 * route.verdict into a human-readable explanation, and compute the J18 /
 * card-fatigue / residual-distribution KPIs from ledger reads.
 *
 * Reads ONLY from memory_events / memory_event_payloads — never from
 * process state. 落账失败的轮次 (turn.started without a matching
 * route.verdict) count as ERRORS, never as successful verdicts.
 */

import type Database from 'better-sqlite3'
import { getDatabase } from '../db/database.js'

export type ExplainedLayer = {
  layer: string
  ruleId: string
  ms: number
  text: string
}

export type RouteVerdictExplanation = {
  turnId: string
  found: true
  finalChannel: 'chat' | 'plugin' | 'work'
  channelText: string
  motive: string
  usedClassifier: boolean
  residualOutcome?: string
  pendingConfirm?: string
  observedAt: string
  layers: ExplainedLayer[]
  summary: string
}

export type RouteVerdictMissing = {
  turnId: string
  found: false
  reason: 'no_verdict'
}

const CHANNEL_TEXT: Record<string, string> = {
  chat: '陪聊：不伸手，本轮没有调用任何能力',
  plugin: '插件调用：调用了口袋里已装好的能力',
  work: '任务：需要动手改磁盘/造插件，已交任务运行时'
}

const LAYER_TEXT: Record<string, string> = {
  redline: '红线检查',
  gate0: '动机识别',
  catalog: '能力清单匹配',
  deterministic: '确定性规则',
  residual: '意图确认（模型）',
  probe: '二次探针',
  normalize: '事实校核（硬改）',
  confirm: '确认卡流程'
}

const MOTIVE_TEXT: Record<string, string> = {
  none: '闲聊/问答',
  organize: '知识整理',
  use: '使用现成能力',
  create: '造新插件',
  update: '改已有插件',
  work: '本机任务',
  redline: '触发红线保护',
  confirm: '处理确认卡',
  shortcut: '对象/控制捷径',
  audit_shortcut: '记忆审计捷径',
  unknown: '未归类'
}

function explainLayers(rawLayers: unknown): ExplainedLayer[] {
  if (!Array.isArray(rawLayers)) return []
  const out: ExplainedLayer[] = []
  for (const l of rawLayers) {
    if (!l || typeof l !== 'object') continue
    const rec = l as Record<string, unknown>
    const layer = typeof rec.layer === 'string' ? rec.layer : 'unknown'
    const ruleId = typeof rec.ruleId === 'string' ? rec.ruleId : 'unsafe:dropped'
    const ms = typeof rec.ms === 'number' ? rec.ms : 0
    out.push({
      layer,
      ruleId,
      ms,
      text: `${LAYER_TEXT[layer] ?? layer}：${ruleId}${ms > 0 ? `（${ms}ms）` : ''}`
    })
  }
  return out
}

export function explainRouteVerdict(
  db: Database.Database,
  turnId: string
): RouteVerdictExplanation | RouteVerdictMissing {
  const row = db
    .prepare(
      `SELECT e.observed_at, p.content_json
       FROM memory_events e
       JOIN memory_event_payloads p ON p.event_id = e.event_id
       WHERE e.event_type = 'route.verdict' AND e.turn_id = ?
       ORDER BY e.observed_at DESC LIMIT 1`
    )
    .get(turnId) as { observed_at: string; content_json: string } | undefined
  if (!row) return { turnId, found: false, reason: 'no_verdict' }

  const c = JSON.parse(row.content_json) as Record<string, unknown>
  const finalChannel =
    c.finalChannel === 'plugin' || c.finalChannel === 'work' ? c.finalChannel : 'chat'
  const motive = typeof c.motive === 'string' ? c.motive : 'unknown'
  const layers = explainLayers(c.layers)
  return {
    turnId,
    found: true,
    finalChannel,
    channelText: CHANNEL_TEXT[finalChannel] ?? finalChannel,
    motive,
    usedClassifier: c.usedClassifier === true,
    residualOutcome: typeof c.residualOutcome === 'string' ? c.residualOutcome : undefined,
    pendingConfirm: typeof c.pendingConfirm === 'string' ? c.pendingConfirm : undefined,
    observedAt: row.observed_at,
    layers,
    summary: layers.length
      ? layers.map((l) => l.text).join(' → ')
      : CHANNEL_TEXT[finalChannel] ?? finalChannel
  }
}

/** Keep SQLite access in the route read model; IPC only asks for an explanation. */
export function explainRouteVerdictForTurn(
  dataRoot: string,
  turnId: string
): RouteVerdictExplanation | RouteVerdictMissing | null {
  const db = getDatabase(dataRoot)
  return db ? explainRouteVerdict(db, turnId) : null
}

// ---------------------------------------------------------------------------
// KPI aggregation (设计 §12.3): J18 覆盖率 / 缺判决错误 / 残差分布 / 卡疲劳
// ---------------------------------------------------------------------------

export type CardFatigueDaily = {
  localDate: string
  proposed: number
  rejected: number
}

export type CardFatigueBySession = {
  sessionId: string
  proposed: number
  rejected: number
}

/** 卡疲劳交叉分组 (Codex 阶段1 三轮 #3): one session on one local day. */
export type CardFatigueSessionDay = {
  sessionId: string
  localDate: string
  proposed: number
  rejected: number
}

export type RouteKpiWindow = {
  windowStart: string
  windowEnd: string
  /**
   * J18 分母: turns in the window that BOTH have a user message AND reached a
   * user-visible outcome (assistant reply finalized, or a plan.* decision /
   * proposal surfaced a card). Turns whose write failed or that never produced
   * a visible result are NOT in the denominator (Codex 阶段1 二轮 #1).
   */
  denominator: number
  /**
   * J18 分子: denominator turns with exactly one route.verdict. Computed over
   * the denominator set only, so it can never exceed the denominator.
   */
  verdicts: number
  /** J18 覆盖率 = verdicts / denominator (0 when denominator is 0). */
  j18Coverage: number
  /** 落账失败轮次: visible-outcome turns without any route.verdict. ERRORS. */
  missingVerdictTurns: number
  missingTurnIds: string[]
  /** classifier-involved verdicts by residual outcome (window totals). */
  residual: { ok: number; timeout: number; invalid_json: number; llm_error: number }
  /** 卡疲劳: window totals + per-local-day and per-session breakdowns. */
  cardFatigue: {
    proposed: number
    rejected: number
    rejectionRate: number
    byLocalDate: CardFatigueDaily[]
    bySession: CardFatigueBySession[]
    /** 交叉分组: 某会话在某本地日. */
    bySessionDay: CardFatigueSessionDay[]
  }
  /** 探针层命中轮次（阶段 3 上线后才有非零值；现在恒 0 占位）。 */
  probeHits: number
}

export function computeRouteKpi(
  db: Database.Database,
  windowStart: string,
  windowEnd: string
): RouteKpiWindow {
  // J18 分母 (Codex 阶段1 三轮 #1): user turns that reached a USER-VISIBLE
  // outcome — assistant reply finalized (chat.assistant_reply) or a card was
  // proposed/decided (plan.*). route.verdict is an INTERNAL record: a turn
  // with only a verdict (ledger-only) has nothing user-visible and is NOT a
  // denominator turn. A user message alone is not either.
  const denominatorTurnIds = (
    db
      .prepare(
        `SELECT DISTINCT e.turn_id AS turn_id
         FROM memory_events e
         WHERE e.observed_at >= ? AND e.observed_at <= ?
           AND e.turn_id IS NOT NULL
           AND (
             e.event_type = 'chat.assistant_reply'
             OR e.event_type LIKE 'plan.%'
           )
           AND EXISTS (
             SELECT 1 FROM memory_events u
             WHERE u.event_type = 'chat.user_message' AND u.turn_id = e.turn_id
           )`
      )
      .all(windowStart, windowEnd) as Array<{ turn_id: string }>
  ).map((r) => r.turn_id)
  const denominatorSet = new Set(denominatorTurnIds)

  // 分子 (Codex 阶段1 三轮 #2 + 二批收口): for each qualified denominator
  // turn, look up ITS verdict BY turnId — WITHOUT a window filter on the
  // verdict itself. A turn whose reply lands after midnight still counts as
  // covered in the day-2 window even though its verdict was stamped the day
  // before. Intersecting with the denominator set stays: ledger-only or
  // orphan verdicts can never be credited.
  const allVerdictTurnIds = new Set(
    (
      db
        .prepare(`SELECT DISTINCT turn_id FROM memory_events WHERE event_type = 'route.verdict'`)
        .all() as Array<{ turn_id: string | null }>
    )
      .map((r) => r.turn_id)
      .filter((t): t is string => Boolean(t))
  )
  const verdictTurnIds = new Set(
    [...allVerdictTurnIds].filter((t) => denominatorSet.has(t))
  )

  let missingVerdictTurns = 0
  const missingTurnIds: string[] = []
  for (const turn_id of denominatorSet) {
    if (!verdictTurnIds.has(turn_id)) {
      missingVerdictTurns += 1
      missingTurnIds.push(turn_id)
    }
  }

  const residualRow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN json_extract(p.content_json,'$.usedClassifier') = 1 THEN 1 ELSE 0 END) as used,
         SUM(CASE WHEN json_extract(p.content_json,'$.residualOutcome')='ok' THEN 1 ELSE 0 END) as ok,
         SUM(CASE WHEN json_extract(p.content_json,'$.residualOutcome')='timeout' THEN 1 ELSE 0 END) as timeout,
         SUM(CASE WHEN json_extract(p.content_json,'$.residualOutcome')='invalid_json' THEN 1 ELSE 0 END) as invalid,
         SUM(CASE WHEN json_extract(p.content_json,'$.residualOutcome')='llm_error' THEN 1 ELSE 0 END) as llmerr,
         SUM(CASE WHEN json_extract(p.content_json,'$.layers') LIKE '%probe%' THEN 1 ELSE 0 END) as probe
       FROM memory_events e
       JOIN memory_event_payloads p ON p.event_id = e.event_id
       WHERE e.event_type = 'route.verdict'
         AND e.observed_at >= ? AND e.observed_at <= ?`
    )
    .get(windowStart, windowEnd) as Record<string, number | null>

  const residual = {
    ok: residualRow.ok ?? 0,
    timeout: residualRow.timeout ?? 0,
    invalid_json: residualRow.invalid ?? 0,
    llm_error: residualRow.llmerr ?? 0
  }

  // 卡疲劳 (Codex 阶段1 二轮 #3): window totals PLUS per-local-day and
  // per-session breakdowns, grouped from real plan.* events.
  const planRows = db
    .prepare(
      `SELECT event_type, session_id, local_date FROM memory_events
       WHERE event_type IN ('plan.proposed', 'plan.rejected')
         AND observed_at >= ? AND observed_at < ?`
    )
    .all(windowStart, windowEnd) as Array<{
    event_type: string
    session_id: string
    local_date: string
  }>
  let proposed = 0
  let rejected = 0
  const byDayMap = new Map<string, CardFatigueDaily>()
  const bySessionMap = new Map<string, CardFatigueBySession>()
  const bySessionDayMap = new Map<string, CardFatigueSessionDay>()
  for (const row of planRows) {
    const isProposed = row.event_type === 'plan.proposed'
    if (isProposed) proposed += 1
    else rejected += 1
    const day = byDayMap.get(row.local_date) ?? { localDate: row.local_date, proposed: 0, rejected: 0 }
    if (isProposed) day.proposed += 1
    else day.rejected += 1
    byDayMap.set(row.local_date, day)
    const sess = bySessionMap.get(row.session_id) ?? {
      sessionId: row.session_id,
      proposed: 0,
      rejected: 0
    }
    if (isProposed) sess.proposed += 1
    else sess.rejected += 1
    bySessionMap.set(row.session_id, sess)
    const crossKey = `${row.session_id}\u001f${row.local_date}`
    const cross =
      bySessionDayMap.get(crossKey) ??
      { sessionId: row.session_id, localDate: row.local_date, proposed: 0, rejected: 0 }
    if (isProposed) cross.proposed += 1
    else cross.rejected += 1
    bySessionDayMap.set(crossKey, cross)
  }
  const byLocalDate = [...byDayMap.values()].sort((a, b) => a.localDate.localeCompare(b.localDate))
  const bySession = [...bySessionMap.values()].sort((a, b) =>
    a.sessionId.localeCompare(b.sessionId)
  )
  const bySessionDay = [...bySessionDayMap.values()].sort(
    (a, b) => a.sessionId.localeCompare(b.sessionId) || a.localDate.localeCompare(b.localDate)
  )

  const denominator = denominatorSet.size
  return {
    windowStart,
    windowEnd,
    denominator,
    verdicts: verdictTurnIds.size,
    j18Coverage: denominator === 0 ? 0 : verdictTurnIds.size / denominator,
    missingVerdictTurns,
    missingTurnIds,
    residual: {
      ok: residual.ok,
      timeout: residual.timeout,
      invalid_json: residual.invalid_json,
      llm_error: residual.llm_error
    },
    cardFatigue: {
      proposed,
      rejected,
      rejectionRate: proposed === 0 ? 0 : rejected / proposed,
      byLocalDate,
      bySession,
      bySessionDay
    },
    probeHits: residualRow.probe ?? 0
  }
}
