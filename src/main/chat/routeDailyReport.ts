/**
 * Route v2 阶段 1 二批 — daily route report generator (Codex 验收范围:
 * 「日报须把缺判决列为错误；探针有效率仍标占位」).
 *
 * Pure ledger reads → a serializable daily report. No UI, no timers here;
 * scheduling lands with the idle-scheduler wiring.
 */

import type Database from 'better-sqlite3'
import { computeRouteKpi, type RouteKpiWindow } from './routeKpi.js'
import { probeEffectiveRate } from '../channel/residualProbe.js'

export type RouteDailyReport = {
  windowStart: string
  windowEnd: string
  generatedAt: string
  j18: {
    denominator: number
    verdicts: number
    coverage: number
    /** 缺判决轮次 — ALWAYS an error row, never a warning. */
    missingVerdictErrors: Array<{ turnId: string; kind: 'missing_verdict' }>
  }
  residual: {
    ok: number
    timeout: number
    invalid_json: number
    llm_error: number
    /** 残差可见失败率 (timeout+invalid+llm_error)/used — null when unused. */
    visibleFailureRate: number | null
  }
  cardFatigue: RouteKpiWindow['cardFatigue']
  probe: {
    hits: number
    /** 探针有效率 — 阶段 3 起接实数; 零样本为 null。 */
    effectiveRate: number | null
    placeholder: boolean
  }
}

export function buildRouteDailyReport(
  db: Database.Database,
  windowStart: string,
  windowEnd: string,
  generatedAt = new Date().toISOString()
): RouteDailyReport {
  const kpi = computeRouteKpi(db, windowStart, windowEnd)
  const used = kpi.residual.ok + kpi.residual.timeout + kpi.residual.invalid_json + kpi.residual.llm_error
  const failed = kpi.residual.timeout + kpi.residual.invalid_json + kpi.residual.llm_error
  return {
    windowStart,
    windowEnd,
    generatedAt,
    j18: {
      denominator: kpi.denominator,
      verdicts: kpi.verdicts,
      coverage: kpi.j18Coverage,
      missingVerdictErrors: kpi.missingTurnIds.map((turnId) => ({
        turnId,
        kind: 'missing_verdict' as const
      }))
    },
    residual: {
      ok: kpi.residual.ok,
      timeout: kpi.residual.timeout,
      invalid_json: kpi.residual.invalid_json,
      llm_error: kpi.residual.llm_error,
      visibleFailureRate: used === 0 ? null : failed / used
    },
    cardFatigue: kpi.cardFatigue,
    probe: {
      hits: kpi.probeHits,
      // 阶段 3-3: 探针有效率接实数 (进程内计数); 零样本仍为 null。
      effectiveRate: probeEffectiveRate(),
      placeholder: false
    }
  }
}

/** Convenience: yesterday's [00:00, 24:00) in the given IANA timezone-ish local dates. */
export function yesterdayWindowUtc(now: Date): { start: string; end: string } {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = end - 24 * 3600 * 1000
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
}
