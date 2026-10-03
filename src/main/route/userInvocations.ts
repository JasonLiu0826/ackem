/**
 * Route v2 阶段 4 — 个性化调用式 (设计 §10).
 *
 * 用户级调用式: 只从**已确认执行成功**的调用学习 (accept 后 succeeded 收据),
 * 措辞取原话片段, 存 per-dataRoot (天然档案隔离, 不随发行包分发)。
 * 匹配顺序: 内置斜杠 > 内置名/别名 > 用户调用式 > 全局调用式 > 能力标签
 * (用户级只允许插入在调用式层, 永不覆盖内置安全语义)。
 *
 * 隐私边界: 用户原话片段 ≤24 字、去引号/控制字符; 重置入口清空整表。
 */

import type Database from 'better-sqlite3'
import { getDatabase } from '../db/database.js'

export type UserInvocation = {
  invocationId: string
  /** 匹配用的安全正则源 (加载时编译, 失败跳过)。 */
  patternSource: string
  /** 学到的原文措辞 (≤24 字, 显示用; 不参与匹配)。 */
  phrase: string
  extensionId: string
  /** 学到它的证据: 成功收据所在轮。 */
  evidenceTurnId: string
  createdAt: string
}

const MAX_PHRASE = 24

export function ensureUserInvocationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS route_user_invocations (
      invocation_id TEXT PRIMARY KEY,
      pattern_source TEXT NOT NULL UNIQUE,
      phrase TEXT NOT NULL,
      extension_id TEXT NOT NULL,
      evidence_turn_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
}

function ensure(db: Database.Database): Database.Database {
  ensureUserInvocationTable(db)
  return db
}

/** 原话 → 安全正则源: 剥首尾空白, 转义正则元字符, 全串字面匹配 (不区分大小写)。 */
export function phraseToPattern(phrase: string): string | null {
  const cleaned = phrase.replace(/[\x00-\x1f\x7f"'`<>\\]/g, '').trim()
  if (cleaned.length < 2 || cleaned.length > MAX_PHRASE) return null
  // 必须含至少一个 CJK 或字母 (纯符号串拒绝)。
  if (!/[\u4e00-\u9fffa-zA-Z]/.test(cleaned)) return null
  return `^${cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}

export function learnUserInvocation(
  db: Database.Database,
  args: { phrase: string; extensionId: string; evidenceTurnId: string; now?: Date }
): 'inserted' | 'duplicate' | 'rejected' {
  const pattern = phraseToPattern(args.phrase)
  if (!pattern) return 'rejected'
  const d = ensure(db)
  try {
    d.prepare(
      `INSERT INTO route_user_invocations (
         invocation_id, pattern_source, phrase, extension_id, evidence_turn_id, created_at
       ) VALUES (?,?,?,?,?,?)`
    ).run(
      `ui_${args.evidenceTurnId}_${args.extensionId.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 120),
      pattern,
      args.phrase.trim().slice(0, MAX_PHRASE),
      args.extensionId,
      args.evidenceTurnId,
      (args.now ?? new Date()).toISOString()
    )
    return 'inserted'
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) return 'duplicate'
    throw e
  }
}

export function learnUserInvocationForDataRoot(
  dataRoot: string,
  args: { phrase: string; extensionId: string; evidenceTurnId: string; now?: Date }
): 'inserted' | 'duplicate' | 'rejected' | 'db_unavailable' {
  const db = getDatabase(dataRoot)
  return db ? learnUserInvocation(db, args) : 'db_unavailable'
}

export function matchUserInvocationForDataRoot(dataRoot: string, text: string): ReturnType<typeof matchUserInvocation> {
  const db = getDatabase(dataRoot)
  return db ? matchUserInvocation(db, text) : null
}

export function listUserInvocations(db: Database.Database, extensionId?: string): UserInvocation[] {
  const d = ensure(db)
  const rows = (
    extensionId
      ? d.prepare(`SELECT * FROM route_user_invocations WHERE extension_id = ? ORDER BY created_at`).all(extensionId)
      : d.prepare(`SELECT * FROM route_user_invocations ORDER BY created_at`).all()
  ) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    invocationId: String(r.invocation_id),
    patternSource: String(r.pattern_source),
    phrase: String(r.phrase),
    extensionId: String(r.extension_id),
    evidenceTurnId: String(r.evidence_turn_id),
    createdAt: String(r.created_at)
  }))
}

/** 匹配: 返回命中的 extensionId (用户调用式只在清单层被消费)。 */
export function matchUserInvocation(
  db: Database.Database,
  text: string
): { extensionId: string; patternSource: string } | null {
  const d = ensure(db)
  const rows = d
    .prepare(`SELECT pattern_source, extension_id FROM route_user_invocations`)
    .all() as Array<{ pattern_source: string; extension_id: string }>
  for (const r of rows) {
    try {
      if (new RegExp(r.pattern_source, 'i').test(text)) {
        return { extensionId: r.extension_id, patternSource: r.pattern_source }
      }
    } catch {
      /* skip broken pattern */
    }
  }
  return null
}

/** 「路由习惯重置」入口 (设计 §10): 清空用户调用式, 保留内置。 */
export function resetUserInvocations(db: Database.Database): number {
  const d = ensure(db)
  const row = d.prepare(`SELECT COUNT(*) as n FROM route_user_invocations`).get() as { n: number }
  d.prepare(`DELETE FROM route_user_invocations`).run()
  return row.n
}
