/**
 * Route v2 阶段 2-2 — Pattern Store (设计 §7).
 *
 * Learned routing patterns as DATA, versioned, with evidence chains and
 * hit/reject counters. Migration is idempotent (column-existence guarded) and
 * registered from schemaVersion.ts as the next schema version AFTER the memory
 * line's own migrations — never a hard-coded V number (Codex D3).
 */

import type Database from 'better-sqlite3'
import { getDatabase } from '../db/database.js'

export type RoutePatternLayer = 'gate0_signal' | 'invocation' | 'tag_hint'

export type RoutePattern = {
  patternId: string
  layer: RoutePatternLayer
  /** 学习模式的目标: 门0 signal 命中的 motive / invocation 的 tag / tag_hint. */
  target: string
  /** 安全校验过的正则源 (加载时再 compile, 编译失败即跳过). */
  patternSource: string
  /** 学习模式产出的 work 判决必带确认卡 (红线 #1, 存库即固化). */
  cardOnly: 0 | 1
  version: number
  status: 'active' | 'disabled' | 'retired'
  evidenceIds: string
  hitCount: number
  rejectCount: number
  createdAt: string
  retiredAt: string | null
}

export function ensureRoutePatternTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS route_patterns (
      pattern_id TEXT PRIMARY KEY,
      layer TEXT NOT NULL CHECK(layer IN ('gate0_signal','invocation','tag_hint')),
      target TEXT NOT NULL,
      pattern_source TEXT NOT NULL,
      card_only INTEGER NOT NULL DEFAULT 1 CHECK(card_only IN (0,1)),
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','retired')),
      evidence_ids TEXT NOT NULL DEFAULT '[]',
      hit_count INTEGER NOT NULL DEFAULT 0,
      reject_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      retired_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_route_patterns_status ON route_patterns(status, layer);
  `)
}

function ensure(db: Database.Database): Database.Database {
  ensureRoutePatternTables(db)
  return db
}

export function insertRoutePattern(
  db: Database.Database,
  pattern: Omit<RoutePattern, 'hitCount' | 'rejectCount' | 'retiredAt'> & {
    hitCount?: number
    rejectCount?: number
  }
): 'inserted' | 'duplicate' {
  const d = ensure(db)
  try {
    d.prepare(
      `INSERT INTO route_patterns (
         pattern_id, layer, target, pattern_source, card_only, version, status,
         evidence_ids, hit_count, reject_count, created_at, retired_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`
    ).run(
      pattern.patternId,
      pattern.layer,
      pattern.target,
      pattern.patternSource,
      pattern.cardOnly,
      pattern.version,
      pattern.status,
      pattern.evidenceIds,
      pattern.hitCount ?? 0,
      pattern.rejectCount ?? 0,
      pattern.createdAt
    )
    return 'inserted'
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) return 'duplicate'
    throw e
  }
}


function mapRow(r: Record<string, unknown>): RoutePattern {
  return {
    patternId: String(r.pattern_id),
    layer: r.layer as RoutePattern['layer'],
    target: String(r.target),
    patternSource: String(r.pattern_source),
    cardOnly: (r.card_only === 1 ? 1 : 0) as 0 | 1,
    version: Number(r.version),
    status: r.status as RoutePattern['status'],
    evidenceIds: String(r.evidence_ids ?? '[]'),
    hitCount: Number(r.hit_count ?? 0),
    rejectCount: Number(r.reject_count ?? 0),
    createdAt: String(r.created_at),
    retiredAt: (r.retired_at as string | null) ?? null
  }
}

export function listActivePatterns(db: Database.Database): RoutePattern[] {
  const d = ensure(db)
  const rows = d
    .prepare(`SELECT * FROM route_patterns WHERE status = 'active' ORDER BY created_at`)
    .all() as Array<Record<string, unknown>>
  return rows.map(mapRow)
}

export function recordPatternHit(db: Database.Database, patternId: string): void {
  ensure(db)
    .prepare(`UPDATE route_patterns SET hit_count = hit_count + 1 WHERE pattern_id = ?`)
    .run(patternId)
}

export function recordPatternReject(db: Database.Database, patternId: string): void {
  ensure(db)
    .prepare(`UPDATE route_patterns SET reject_count = reject_count + 1 WHERE pattern_id = ?`)
    .run(patternId)
}

/** 设计 §6.3 退役: 上线后命中即被拒 ≥ 3 次 → 自动 disabled (审计链保留). */
export function retireRejectedPatterns(db: Database.Database, nowIso: string): string[] {
  const d = ensure(db)
  const rows = d
    .prepare(
      `SELECT pattern_id, pattern_source FROM route_patterns
       WHERE status = 'active' AND reject_count >= 3 AND reject_count > hit_count`
    )
    .all() as Array<{ pattern_id: string; pattern_source: string }>
  for (const r of rows) {
    d.prepare(
      `UPDATE route_patterns SET status = 'disabled', retired_at = ? WHERE pattern_id = ?`
    ).run(nowIso, r.pattern_id)
  }
  return rows.map((r) => r.pattern_id)
}

/**
 * 源级禁坑 (阶段 5-4 决策): retired 的 source 禁止重挖复活 —
 * "惹事的规则换皮回归"被阻断; 解除只能通过设置页显式删除退役行
 * (语义: 用户明确要求重学) 或编辑 status (运维操作)。
 */
export function listRetiredSources(db: Database.Database): Set<string> {
  const d = ensure(db)
  const rows = d
    .prepare(`SELECT pattern_source FROM route_patterns WHERE status IN ('disabled','retired')`)
    .all() as Array<{ pattern_source: string }>
  return new Set(rows.map((r) => r.pattern_source))
}

export function getRoutePattern(db: Database.Database, patternId: string): RoutePattern | null {
  const d = ensure(db)
  const row = d.prepare(`SELECT * FROM route_patterns WHERE pattern_id = ?`).get(patternId) as
    | Record<string, unknown>
    | undefined
  return row ? mapRow(row) : null
}

/** Convenience for tests / the settings page. */
export function openRoutePatternDb(dataRoot: string): Database.Database | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  return ensure(db)
}
