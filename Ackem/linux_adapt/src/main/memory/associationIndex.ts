// [associationIndex] — 记忆关联索引
// 职责：管理 memory_associations 的内存索引，支持 O(1) 查询和增量更新
// 引用：../db/database

import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db/database'
import { createLogger } from '../logger'

const log = createLogger('association-index')

export type AssociationType = 'temporal' | 'entity' | 'event_chain' | 'emotion_peak' | 'self_reference' | 'thematic'

export interface Association {
  id: string
  fact_id_a: string
  fact_id_b: string
  association_type: AssociationType
  strength: number
  created_at: string
  last_activated_at: string | null
}

export class AssociationIndex {
  /** factId → 关联列表（双向索引） */
  private byFact = new Map<string, Association[]>()
  /** "a||b" → 关联对象（排序后的 key，用于快速查找和更新） */
  private byKey = new Map<string, Association>()
  /** id → 关联对象 */
  private byId = new Map<string, Association>()
  private dataRoot: string | null = null

  /** 从 DB 加载全部关联到内存 */
  load(dataRoot: string): void {
    this.dataRoot = dataRoot
    const db = getDatabase(dataRoot)
    if (!db) return

    try {
      const rows = db.prepare('SELECT * FROM memory_associations WHERE strength > 0.05').all() as Array<{
        id: string; fact_id_a: string; fact_id_b: string; association_type: string;
        strength: number; created_at: string; last_activated_at: string | null
      }>
      for (const row of rows) {
        const assoc: Association = {
          id: row.id,
          fact_id_a: row.fact_id_a,
          fact_id_b: row.fact_id_b,
          association_type: row.association_type as AssociationType,
          strength: row.strength,
          created_at: row.created_at,
          last_activated_at: row.last_activated_at
        }
        this.addToIndex(assoc)
      }
      log.info('关联索引加载完成', { count: rows.length })
    } catch (e) {
      log.warn('关联索引加载失败', { error: String(e) })
    }
  }

  /** 新增关联（内存 + DB） */
  add(assoc: Omit<Association, 'id' | 'created_at' | 'last_activated_at'>): Association {
    const full: Association = {
      id: randomUUID(),
      ...assoc,
      created_at: new Date().toISOString(),
      last_activated_at: null
    }
    this.addToIndex(full)
    this.persistInsert(full)
    return full
  }

  /** O(1) 查询：获取某事实的所有关联（过滤最低强度） */
  getAssociations(factId: string, minStrength = 0.1): Association[] {
    return (this.byFact.get(factId) ?? []).filter(a => a.strength >= minStrength)
  }

  /** 按 ID 获取 */
  getById(id: string): Association | undefined {
    return this.byId.get(id)
  }

  /** 饱和更新强度（检索激活时调用） */
  strengthen(factIdA: string, factIdB: string): void {
    const key = this.makeKey(factIdA, factIdB)
    const existing = this.byKey.get(key)
    if (existing && existing.strength < 0.95) {
      existing.strength = 1 - (1 - existing.strength) * 0.95
      existing.last_activated_at = new Date().toISOString()
      this.persistUpdate(existing)
    }
  }

  /** 共现激活：有则更新，无则新建弱关联 */
  strengthenOrCreate(factIdA: string, factIdB: string, assocType?: AssociationType): void {
    const key = this.makeKey(factIdA, factIdB)
    const existing = this.byKey.get(key)
    if (existing) {
      if (existing.strength < 0.95) {
        existing.strength = 1 - (1 - existing.strength) * 0.95
        existing.last_activated_at = new Date().toISOString()
        this.persistUpdate(existing)
      }
    } else {
      this.add({
        fact_id_a: factIdA,
        fact_id_b: factIdB,
        association_type: assocType ?? 'thematic',
        strength: 0.15
      })
    }
  }

  /** 降权（纠错/遗忘时调用） */
  weaken(assocId: string, factor: number): void {
    const assoc = this.byId.get(assocId)
    if (!assoc) return
    assoc.strength *= factor
    assoc.last_activated_at = new Date().toISOString()
    if (assoc.strength < 0.05) {
      this.remove(assocId)
    } else {
      this.persistUpdate(assoc)
    }
  }

  /** 按事实 ID 降权所有关联（遗忘时调用） */
  weakenByFactId(factId: string, factor: number): void {
    const assocs = this.byFact.get(factId) ?? []
    for (const assoc of [...assocs]) {
      this.weaken(assoc.id, factor)
    }
  }

  /** 删除关联 */
  remove(assocId: string): void {
    const assoc = this.byId.get(assocId)
    if (!assoc) return
    this.removeFromIndex(assoc)
    this.persistDelete(assocId)
  }

  /** 获取所有关联（用于遍历） */
  listAll(): Association[] {
    return Array.from(this.byId.values())
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  private addToIndex(assoc: Association): void {
    this.byId.set(assoc.id, assoc)
    const key = this.makeKey(assoc.fact_id_a, assoc.fact_id_b)
    this.byKey.set(key, assoc)
    this.addEdge(assoc.fact_id_a, assoc)
    this.addEdge(assoc.fact_id_b, assoc)
  }

  private removeFromIndex(assoc: Association): void {
    this.byId.delete(assoc.id)
    const key = this.makeKey(assoc.fact_id_a, assoc.fact_id_b)
    this.byKey.delete(key)
    this.removeEdge(assoc.fact_id_a, assoc.id)
    this.removeEdge(assoc.fact_id_b, assoc.id)
  }

  private addEdge(factId: string, assoc: Association): void {
    let list = this.byFact.get(factId)
    if (!list) {
      list = []
      this.byFact.set(factId, list)
    }
    list.push(assoc)
  }

  private removeEdge(factId: string, assocId: string): void {
    const list = this.byFact.get(factId)
    if (!list) return
    const idx = list.findIndex(a => a.id === assocId)
    if (idx >= 0) list.splice(idx, 1)
    if (list.length === 0) this.byFact.delete(factId)
  }

  private makeKey(a: string, b: string): string {
    return a < b ? `${a}||${b}` : `${b}||${a}`
  }

  private persistInsert(assoc: Association): void {
    if (!this.dataRoot) return
    const db = getDatabase(this.dataRoot)
    if (!db) return
    try {
      db.prepare(
        'INSERT INTO memory_associations (id, fact_id_a, fact_id_b, association_type, strength, created_at, last_activated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(assoc.id, assoc.fact_id_a, assoc.fact_id_b, assoc.association_type, assoc.strength, assoc.created_at, assoc.last_activated_at)
    } catch (e) {
      log.warn('关联写入 DB 失败', { error: String(e) })
    }
  }

  private persistUpdate(assoc: Association): void {
    if (!this.dataRoot) return
    const db = getDatabase(this.dataRoot)
    if (!db) return
    try {
      db.prepare(
        'UPDATE memory_associations SET strength = ?, last_activated_at = ? WHERE id = ?'
      ).run(assoc.strength, assoc.last_activated_at, assoc.id)
    } catch (e) {
      log.warn('关联更新 DB 失败', { error: String(e) })
    }
  }

  private persistDelete(assocId: string): void {
    if (!this.dataRoot) return
    const db = getDatabase(this.dataRoot)
    if (!db) return
    try {
      db.prepare('DELETE FROM memory_associations WHERE id = ?').run(assocId)
    } catch (e) {
      log.warn('关联删除 DB 失败', { error: String(e) })
    }
  }
}
