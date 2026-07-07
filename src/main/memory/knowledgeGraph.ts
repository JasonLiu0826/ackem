// [knowledgeGraph] 鈥?杞婚噺鐭ヨ瘑鍥捐氨
// 鑱岃矗锛氬疄浣?鍏崇郴-瀹炰綋涓夊厓缁勫瓨鍌ㄣ€佸疄浣撶储寮曘€佷竴璺虫煡璇?
// 瀵规爣 LangGraph knowledge graph memory
// 寮曠敤锛?./engine/types, ../engine/AckemParams

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { KG_CHAR_BUDGET, KG_CJK_CHAR_MATCH_WEIGHT, KG_ENTITY_MATCH_WEIGHT, KG_KEYWORD_MATCH_WEIGHT, KG_MIN_SCORE, KG_QUERY_MAX_TRIPLES } from '../engine/AckemParams'
import {
  countTriplesInDb,
  loadTriplesFromDb,
  replaceTriplesInDb,
  insertTriple,
  deleteAllTriplesFromDb
} from '../db/repos/knowledgeTriples'
import { dataRootFromFactsPath } from '../db/paths'
import type { Triple } from '../engine/types'

type KgFile = { version: string; triples: Triple[] }

export function defaultKgPath(dataRoot: string): string {
  return join(dataRoot, 'memory', 'kg', 'kg.v1.json')
}

export class KnowledgeGraph {
  private triples: Triple[] = []
  private entityIndex = new Map<string, Set<number>>()
  private readonly path: string
  /** Phase 3: DB 鍙敤鏃惰蛋澧為噺鍐欏叆 */
  private useDb = false

  constructor(filePath: string) {
    this.path = filePath
  }

  private get dataRoot(): string {
    return dataRootFromFactsPath(this.path)
  }

  load(): void {
    const dataRoot = this.dataRoot
    if (countTriplesInDb(dataRoot) > 0) {
      this.triples = loadTriplesFromDb(dataRoot)
      this.rebuildIndex()
      this.useDb = true
      return
    }
    if (!existsSync(this.path)) {
      this.triples = []
      return
    }
    try {
      const j = JSON.parse(readFileSync(this.path, 'utf-8')) as KgFile
      this.triples = Array.isArray(j.triples) ? j.triples : []
      this.rebuildIndex()
      if (this.triples.length > 0) {
        replaceTriplesInDb(dataRoot, this.triples)
        this.useDb = true
      }
    } catch {
      this.triples = []
    }
  }

  /** Phase 3: 浠呯敤浜?JSON 鍥為€€妯″紡 */
  private persist(): void {
    if (this.useDb) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify({ version: '1.0', triples: this.triples }, null, 2), 'utf-8')
    replaceTriplesInDb(this.dataRoot, this.triples)
  }

  private rebuildIndex(): void {
    this.entityIndex.clear()
    for (let i = 0; i < this.triples.length; i++) {
      const t = this.triples[i]
      this.addToIndex(t.subject, i)
      this.addToIndex(t.object, i)
    }
  }

  private addToIndex(entity: string, idx: number): void {
    const key = entity.toLowerCase()
    const set = this.entityIndex.get(key) ?? new Set()
    set.add(idx)
    this.entityIndex.set(key, set)
  }

  add(raw: {
    subject: string
    predicate: string
    object: string
    confidence: number
    sourceFactIds: string[]
  }): Triple {
    const t: Triple = {
      id: randomUUID(),
      subject: raw.subject,
      predicate: raw.predicate,
      object: raw.object,
      confidence: raw.confidence,
      sourceFactIds: raw.sourceFactIds,
      createdAt: new Date().toISOString()
    }
    const idx = this.triples.length
    this.triples.push(t)
    this.addToIndex(raw.subject, idx)
    this.addToIndex(raw.object, idx)
    if (this.useDb) {
      insertTriple(this.dataRoot, t)
    } else {
      this.persist()
    }
    return t
  }

  count(): number {
    return this.triples.length
  }

  listAll(): Triple[] {
    return [...this.triples]
  }

  clear(): void {
    this.triples = []
    this.entityIndex.clear()
    if (this.useDb) {
      deleteAllTriplesFromDb(this.dataRoot)
    } else {
      this.persist()
    }
  }

  oneHop(entity: string): Triple[] {
    return this.findByEntity(entity)
  }

  /** 鎸夊疄浣撳悕鏌ユ壘鎵€鏈夊叧鑱斾笁鍏冪粍 */
  findByEntity(entity: string): Triple[] {
    const key = entity.toLowerCase()
    const indices = this.entityIndex.get(key)
    if (!indices) return []
    return [...indices].map(i => this.triples[i]).filter(Boolean)
  }

  /** 鎸夋煡璇㈡枃鏈仛鍏抽敭璇嶅尮閰嶏紝杩斿洖鐩稿叧涓夊厓缁?*/
  query(text: string, maxResults: number = KG_QUERY_MAX_TRIPLES): Triple[] {
    const queryLower = text.toLowerCase()
    const scored = this.triples.map(t => {
      let score = 0
      const text = `${t.subject} ${t.predicate} ${t.object}`.toLowerCase()
      // Full match on any entity
      for (const [entity] of this.entityIndex) {
        if (queryLower.includes(entity)) score += KG_ENTITY_MATCH_WEIGHT
      }
      // Partial keyword match (>= 2 chars) or single CJK char match
      const qWords = queryLower.split(/[\s,锛屻€傦紒锛熴€侊紱]+/).filter(w => w.length >= 2)
      for (const w of qWords) {
        if (text.includes(w)) score += KG_KEYWORD_MATCH_WEIGHT
      }
      // Single CJK character match
      for (const ch of queryLower) {
        if (ch.trim() && /[\u4e00-\u9fff]/.test(ch) && text.includes(ch)) {
          score += KG_CJK_CHAR_MATCH_WEIGHT
        }
      }
      return { t, score }
    })

    return scored
      .filter(({ score }) => score >= KG_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ t }) => t)
  }

  buildContextBlock(text: string, charBudget: number = KG_CHAR_BUDGET): string {
    const hits = this.query(text)
    if (hits.length === 0) return ''
    const lines = ['銆愮煡璇嗗浘璋便€?]
    let chars = 0
    for (const t of hits) {
      const line = `- ${t.subject} 鈥?{t.predicate}鈫?${t.object}`
      if (chars + line.length > charBudget) break
      lines.push(line)
      chars += line.length
    }
    return lines.length > 1 ? lines.join('\n') : ''
  }
}
