// [factStore] 鈥?L4 浜嬪疄搴?
// 鑱岃矗锛歠acts.v2.json CRUD銆佹绱€乵emoirTrust銆乵emoryEcho
// 杈撳叆锛氭枃浠惰矾寰?
// 杈撳嚭锛歁emoryFact 闆嗗悎鎿嶄綔
// 寮曠敤锛?/taxonomy, ../engine/types, ../engine/AckemParams

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  MEMORY_ECHO_AFF_WEIGHT,
  MEMORY_ECHO_CAP,
  MEMORY_ECHO_SEC_NEGATIVE,
  MEMORY_ECHO_SEC_POSITIVE,
  MOOD_CONGRUENT_BOOST,
  MOOD_CONGRUENT_VALENCE_DIFF,
  MOOD_CONGRUENT_EXTREME_THRESHOLD,
  MOOD_CONGRUENT_EXTREME_BOOST,
  MEMOIR_TRUST_FLOOR,
  CONSOLIDATED_DECAY_LAMBDA,
  CORE_SCORE_THRESHOLD,
  FACT_DEDUP_THRESHOLD,
  RECENCY_BOOST_WINDOW_HOURS,
  RECENCY_BOOST_FACTOR,
  MEMORY_ECHO_ARO_INTENSITY_WEIGHT,
  MEMORY_ECHO_DOM_TRUST_WEIGHT,
  CORE_MEMORY_WEIGHT_THRESHOLD,
  CORE_MEMORY_MAX_COUNT,
  AUTO_COMPACT_RETENTION_DAYS,
  FACTSTORE_WRITE_BUFFER_MS,
  FACT_DEDUP_WEIGHT_BOOST
} from '../engine/AckemParams'

/** Embedding 鍘婚噸闃堝€硷細鍚?domain + 鍚?subcategory 鏃讹紝cosine > 姝ゅ€艰涓鸿涔夐噸澶?*/
const EMBEDDING_DEDUP_THRESHOLD = 0.85
import type { EmotionalContext, FactLayer, MemoryEcho, MemoryFact, MemoryTier } from '../engine/types'
import { normalizeConfidence } from '../../shared/confidence'
import {
  countFactsInDb,
  loadFactsFromDb,
  replaceFactsInDb,
  insertFact,
  updateFactInDb,
  deleteFactFromDb
} from '../db/repos/memoryFacts'
import { searchFactIdsFts } from '../db/repos/fts'
import { getDatabase } from '../db/database'
import { dataRootFromFactsPath } from '../db/paths'
import { CATEGORY_META, type Subcategory, isValidSubcategory } from './taxonomy'
import { cosineSimilarity } from './factEmbeddingCache'

type FactsFile = { version: string; facts: MemoryFact[] }

function mostRestrictivePrivacy(
  a?: MemoryFact['privacyLevel'],
  b?: MemoryFact['privacyLevel']
): MemoryFact['privacyLevel'] {
  const rank = { normal: 0, intimate: 1, explicit: 2 } as const
  const aa = a ?? 'normal'
  const bb = b ?? 'normal'
  return rank[bb] > rank[aa] ? bb : aa
}

export interface AddFactResult {
  fact: MemoryFact
  isNew: boolean
  mergedWith?: string
}

export class FactStore {
  private facts: MemoryFact[] = []
  private byId = new Map<string, MemoryFact>()
  /** 澶栭儴娉ㄥ叆鐨?Embedding 缂撳瓨寮曠敤锛堢敤浜庡幓閲嶆椂鏌ュ凡鏈変簨瀹炵殑 embedding锛?*/
  _embeddingCache?: Map<string, number[]>
  private readonly path: string
  private dirty = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  /** Phase 3: DB 鍙敤鏃惰蛋澧為噺鍐欏叆锛屼笉鍐嶅叏琛ㄩ噸鍐?*/
  private useDb = false

  constructor(filePath: string) {
    this.path = filePath
  }

  /** SQLite dataRoot锛坢emory/facts/... 鈫?椤圭洰 data 鏍圭洰褰曪級 */
  getDataRoot(): string {
    return dataRootFromFactsPath(this.path)
  }

  /** O(1) 鎸?ID 鏌ユ壘浜嬪疄 */
  getById(id: string): MemoryFact | undefined {
    return this.byId.get(id)
  }

  private get dataRoot(): string {
    return dataRootFromFactsPath(this.path)
  }

  load(): void {
    this.flushLegacy()
    const dataRoot = this.dataRoot

    const dbCount = countFactsInDb(dataRoot)
    if (dbCount > 0) {
      this.facts = loadFactsFromDb(dataRoot)
      this.rebuildIdIndex()
      this.dirty = false
      this.useDb = true
      return
    }

    if (!existsSync(this.path)) {
      this.facts = []
      this.byId.clear()
      return
    }
    try {
      const j = JSON.parse(readFileSync(this.path, 'utf-8')) as FactsFile
      this.facts = Array.isArray(j.facts) ? j.facts : []
      let migrated = false
      for (const f of this.facts) {
        const n = normalizeConfidence(f.confidence)
        if (n !== f.confidence) {
          f.confidence = n
          migrated = true
        }
      }
      if (this.facts.length > 0) {
        replaceFactsInDb(dataRoot, this.facts)
        // 鍙湪 DB 鐪熸鍙敤鏃舵墠璁?useDb锛坮eplaceFactsInDb 鍙兘鍥?DB 涓嶅彲鐢ㄨ€岄潤榛樿烦杩囷級
        if (countFactsInDb(dataRoot) > 0) {
          this.useDb = true
        }
      }
      if (migrated) {
        this.dirty = true
        this.flushLegacy()
      }
    } catch {
      this.facts = []
    }
    this.rebuildIdIndex()
  }

  /** Phase 3: DB 妯″紡涓嬩笉鍐嶉渶瑕?persist/flush锛堝閲忔搷浣滃凡瀹炴椂鍐?DB锛?*/
  private rebuildIdIndex(): void {
    this.byId.clear()
    for (const f of this.facts) {
      this.byId.set(f.id, f)
    }
  }

  private persist(): void {
    if (this.useDb) return // 澧為噺鎿嶄綔宸插湪鍚勬柟娉曚腑鐩存帴鍐?DB
    this.dirty = true
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.flushLegacy(), FACTSTORE_WRITE_BUFFER_MS)
  }

  /** 浠呯敤浜?JSON 鍥為€€妯″紡 */
  private flushLegacy(): void {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null }
    if (!this.dirty) return
    this.dirty = false
    mkdirSync(dirname(this.path), { recursive: true })
    const body: FactsFile = { version: '2.0', facts: this.facts }
    writeFileSync(this.path, JSON.stringify(body, null, 2), 'utf-8')
    replaceFactsInDb(this.dataRoot, this.facts)
  }

  /** 鍏煎澶栭儴璋冪敤锛堝 postChatTurn锛?*/
  flush(): void {
    this.flushLegacy()
  }

  /** SQLite 鍙敤鏃惰蛋澧為噺 DB 鍐欏叆锛堝鍏?鎵归噺鍐欏叆鍓嶈皟鐢級 */
  preferDbWrites(): void {
    if (getDatabase(this.dataRoot)) {
      this.useDb = true
    }
  }

  /** 绉婚櫎瓒呰繃淇濈暀鏈熺殑閫€褰圭灛鏃剁姸鎬侊紙浠?NOW/PLANS/WORLD锛夛紝鐪熷疄璁板繂姘歌繙淇濈暀 */
  compactFacts(): number {
    const cutoff = new Date(Date.now() - AUTO_COMPACT_RETENTION_DAYS * 86400000).toISOString()
    // 鍙墿鐞嗗垹闄ょ灛鏃剁姸鎬侊紙NOW/PLANS/WORLD锛夛紝鍏朵粬閫€褰逛簨瀹烇紙鐭涚浘妫€娴嬨€侀檷鏉冪瓑锛夋案杩滀繚鐣?
    const TRANSIENT_SUBS = new Set(['NOW', 'PLANS', 'WORLD'])
    const toRemove = this.facts.filter(f =>
      f.status !== 'active' &&
      TRANSIENT_SUBS.has(f.subcategory) &&
      new Date(f.updatedAt).getTime() < new Date(cutoff).getTime()
    )
    if (toRemove.length === 0) return 0
    const removeIds = new Set(toRemove.map(f => f.id))
    this.facts = this.facts.filter(f => !removeIds.has(f.id))
    for (const id of removeIds) this.byId.delete(id)
    if (this.useDb) {
      for (const id of removeIds) deleteFactFromDb(this.dataRoot, id)
    } else {
      this.persist()
    }
    return toRemove.length
  }

  listActive(): MemoryFact[] {
    return this.facts.filter((f) => f.status === 'active')
  }

  /** Phase 2锛欶TS5 鍏抽敭璇嶆绱紙DB 鍙敤鏃讹級 */
  searchByFts(query: string, topK: number): MemoryFact[] {
    const dataRoot = dataRootFromFactsPath(this.path)
    const ids = searchFactIdsFts(dataRoot, query, topK)
    if (ids.length === 0) return []
    const idSet = new Set(ids)
    return this.listActive().filter((f) => idSet.has(f.id))
  }

  countSharedBondFacts(): number {
    return this.facts.filter((f) => f.status === 'active' && f.subcategory === 'OUR_BOND').length
  }

  computeMemoirTrust(): number | null {
    const ours = this.facts.filter((f) => f.status === 'active' && f.subcategory === 'OUR_BOND')
    if (ours.length === 0) return null
    let w = 0
    let s = 0
    const now = Date.now()
    for (const f of ours) {
      const days = Math.max(0, (now - new Date(f.createdAt).getTime()) / 86400000)
      const meta = isValidSubcategory(f.subcategory) ? CATEGORY_META[f.subcategory] : null
      const lam = meta?.decayLambda ?? 0.01
      const decay = Math.exp(-lam * days)
      const wgt = f.weight * decay * f.confidence
      w += wgt
      s += f.emotionalContext.trust * wgt
    }
    if (w <= 0) return null
    const raw = s / w
    // 涓嬮檺淇濇姢锛氶槻姝㈤暱鏈熶綆淇′换瀵艰嚧 memoir_trust 鏃犻檺涓嬮檷
    // 纭繚"鐮村啺"鏈哄埗鏈夋満浼氱敓鏁堬紙ICE_BREAK_TRUST_THRESHOLD=15锛?
    return Math.max(raw, MEMOIR_TRUST_FLOOR)
  }

  scoreRelevance(f: MemoryFact, now: number, currentValence?: number, currentAff?: number, queryEmbed?: number[]): number {
    const meta = isValidSubcategory(f.subcategory) ? CATEGORY_META[f.subcategory] : CATEGORY_META.MOOD
    const days = Math.max(0, (now - new Date(f.createdAt).getTime()) / 86400000)
    // consolidated 娲炲療鐢ㄤ笓鐢?位锛?.003锛夛紝姣斿師濮嬩簨瀹炶“鍑忔參
    const lambda = f.factLayer === 'consolidated' ? CONSOLIDATED_DECAY_LAMBDA : meta.decayLambda
    const decay = Math.exp(-lambda * days)
    const ei = f.emotionalContext.intensity
    let score =
      f.weight * decay * f.selfRelevance * (1 + ei * 0.5)
    if (
      currentValence !== undefined &&
      Math.abs(f.emotionalContext.valence - currentValence) < MOOD_CONGRUENT_VALENCE_DIFF
    ) {
      // 鏋佺鎯呯华鏃堕檷浣庡悓璋冨姞鏉冿紝闃叉璐熷悜寮哄寲铻烘棆
      // aff < -50 鎴?aff > 50 鏃讹紝boost 浠?1.5 闄嶅埌 1.2
      const isExtreme = currentAff !== undefined && Math.abs(currentAff) >= MOOD_CONGRUENT_EXTREME_THRESHOLD
      const boost = isExtreme ? MOOD_CONGRUENT_EXTREME_BOOST : MOOD_CONGRUENT_BOOST
      score *= boost
    }
    // O2: 杩戝洜鍔犳潈 鈥?鏈€杩戞洿鏂扮殑浜嬪疄鑾峰緱棰濆鍔犳垚
    const hoursSinceUpdate = (now - new Date(f.updatedAt).getTime()) / 3600000
    if (hoursSinceUpdate < RECENCY_BOOST_WINDOW_HOURS) {
      score *= RECENCY_BOOST_FACTOR
    }
    // Embedding 鎯呯华瀵归綈锛堝彲閫夛級锛氳涔夊眰闈㈠尮閰嶅綋鍓嶆秷鎭拰璁板繂浜嬪疄
    if (queryEmbed && this._embeddingCache) {
      const factEmbed = this._embeddingCache.get(f.id)
      if (factEmbed && factEmbed.length > 0) {
        const alignment = cosineSimilarity(queryEmbed, factEmbed)
        score *= (1 + alignment * 0.3)
      }
    }
    return score
  }

  searchByTriggers(userMessage: string): MemoryFact[] {
    const m = userMessage.toLowerCase()
    return this.listActive().filter((f) => f.triggers.some((t) => m.includes(t.toLowerCase())))
  }

  selectForInjection(
    budgetChars: number,
    minConfidence: number,
    currentValence?: number,
    opts?: { adultMode?: boolean }
  ): { facts: MemoryFact[]; chars: number } {
    const now = Date.now()
    const includeAdult = opts?.adultMode === true
    const ranked = this.listActive()
      .filter((f) => f.confidence >= minConfidence)
      .filter((f) => includeAdult || (f.privacyLevel ?? 'normal') === 'normal')
      .map((f) => ({ f, s: this.scoreRelevance(f, now, currentValence) }))
      .sort((a, b) => b.s - a.s)

    const out: MemoryFact[] = []
    let chars = 0
    for (const { f } of ranked) {
      const block = f.summary.length + 40
      if (chars + block > budgetChars) break
      out.push(f)
      chars += block
    }
    return { facts: out, chars }
  }

  computeMemoryEcho(facts: MemoryFact[]): MemoryEcho {
    if (facts.length === 0) return { aff: 0, sec: 0, aro: 0, dom: 0 }
    const now = Date.now()
    let sumW = 0
    let aff = 0
    let sec = 0
    let aro = 0
    let dom = 0
    for (const f of facts) {
      const meta = isValidSubcategory(f.subcategory) ? CATEGORY_META[f.subcategory] : CATEGORY_META.MOOD
      const days = Math.max(0, (now - new Date(f.createdAt).getTime()) / 86400000)
      const decay = Math.exp(-meta.decayLambda * days)
      const w = f.emotionalContext.intensity * decay * f.selfRelevance * (f.weight / 3)
      sumW += w
      aff += f.emotionalContext.valence * w * MEMORY_ECHO_AFF_WEIGHT
      sec += (f.emotionalContext.trust > 50 ? MEMORY_ECHO_SEC_POSITIVE : MEMORY_ECHO_SEC_NEGATIVE) * w
      // O4: 璁＄畻 aro锛堝敜閱掑害=寮哄害脳鏉冮噸锛夊拰 dom锛堟敮閰嶅害=淇′换/姘旀皼淇″彿锛?
      aro += f.emotionalContext.intensity * w * MEMORY_ECHO_ARO_INTENSITY_WEIGHT
      const domTrust = f.emotionalContext.trust > 50 ? 0.3 : -0.3
      const domAtm = f.emotionalContext.atmosphere === 'warm' ? 0.2 : f.emotionalContext.atmosphere === 'cool' ? -0.2 : 0
      dom += (domTrust + domAtm) * w * MEMORY_ECHO_DOM_TRUST_WEIGHT
    }
    if (sumW <= 0) return { aff: 0, sec: 0, aro: 0, dom: 0 }
    let ea = aff / sumW
    let es = sec / sumW
    let eAr = aro / sumW
    let eDom = dom / sumW
    ea = Math.max(-MEMORY_ECHO_CAP, Math.min(MEMORY_ECHO_CAP, ea))
    es = Math.max(-MEMORY_ECHO_CAP, Math.min(MEMORY_ECHO_CAP, es))
    eAr = Math.max(-MEMORY_ECHO_CAP, Math.min(MEMORY_ECHO_CAP, eAr))
    eDom = Math.max(-MEMORY_ECHO_CAP, Math.min(MEMORY_ECHO_CAP, eDom))
    return { aff: ea, sec: es, aro: eAr, dom: eDom }
  }

  findSimilarFacts(subcategory: string, subject: string, summary: string, threshold?: number): MemoryFact[] {
    const thresh = threshold ?? FACT_DEDUP_THRESHOLD
    const charSet = (s: string) => {
      const set = new Set<string>()
      for (const ch of s.toLowerCase()) {
        if (ch !== ' ') set.add(ch)
      }
      return set
    }
    const qSet = charSet(`${subject} ${summary}`)
    if (qSet.size < 2) return []

    const results: MemoryFact[] = []
    for (const f of this.facts) {
      if (f.status !== 'active' || f.subcategory !== subcategory) continue
      const fSet = charSet(`${f.subject} ${f.summary}`)
      if (fSet.size < 2) continue
      let intersect = 0
      for (const ch of qSet) {
        if (fSet.has(ch)) intersect++
      }
      const union = new Set([...qSet, ...fSet])
      const sim = intersect / union.size
      if (sim >= thresh) results.push(f)
    }
    return results
  }

  getCoreFacts(): MemoryFact[] {
    return this.facts.filter(f => f.status === 'active' && f.tier === 'core')
  }

  promoteToCore(id: string): boolean {
    const f = this.facts.find(x => x.id === id)
    if (!f || f.status !== 'active') return false
    f.tier = 'core'
    f.updatedAt = new Date().toISOString()
    this.autoDemoteExcessCores()
    if (this.useDb) {
      updateFactInDb(this.dataRoot, f)
    } else {
      this.persist()
    }
    return true
  }

  /** 璁＄畻琛板噺鍚庡垎鏁帮紙鐢ㄤ簬 core 甯綅绔炰簤鍜屾帓搴忥級 */
  private computeDecayedScore(f: MemoryFact): number {
    const now = Date.now()
    const days = Math.max(0, (now - new Date(f.createdAt).getTime()) / 86400000)
    const meta = isValidSubcategory(f.subcategory) ? CATEGORY_META[f.subcategory as Subcategory] : null
    const lambda = f.factLayer === 'consolidated' ? CONSOLIDATED_DECAY_LAMBDA : (meta?.decayLambda ?? 0.005)
    return f.weight * Math.exp(-lambda * days) * f.selfRelevance
  }

  autoDemoteExcessCores(): void {
    const cores = this.facts.filter(f => f.status === 'active' && f.tier === 'core')
    if (cores.length <= CORE_MEMORY_MAX_COUNT) return
    // 鎸?decayedScore 鎺掑簭锛堣€岄潪瑁?weight锛夛紝鍍靛案鏍稿績璁板繂浼樿儨鍔ｆ卑
    cores.sort((a, b) => this.computeDecayedScore(a) - this.computeDecayedScore(b))
    const toDemote = cores.slice(0, cores.length - CORE_MEMORY_MAX_COUNT)
    for (const f of toDemote) {
      f.tier = 'archival'
      f.updatedAt = new Date().toISOString()
      if (this.useDb) {
        updateFactInDb(this.dataRoot, f)
      }
    }
  }

  private findSimilarFact(
    subcategory: string,
    subject: string,
    summary: string,
    domain?: string,
    embedding?: number[],
    embeddingCache?: Map<string, number[]>
  ): MemoryFact | null {
    const charSet = (s: string) => {
      const set = new Set<string>()
      for (const ch of s.toLowerCase()) {
        if (ch !== ' ') set.add(ch)
      }
      return set
    }
    const qSet = charSet(`${subject} ${summary}`)
    if (qSet.size < 2 && !embedding) return null

    let bestMatch: MemoryFact | null = null
    let bestSim = 0

    for (const f of this.facts) {
      if (f.status !== 'active' || f.subcategory !== subcategory) continue
      if (domain && f.domain !== domain) continue  // 鍚?domain 绾︽潫

      // Embedding 鍘婚噸锛堜紭鍏堬紝璇箟鏇村噯锛?
      if (embedding && embeddingCache) {
        const fEmbed = embeddingCache.get(f.id)
        if (fEmbed) {
          const cosine = cosineSimilarity(embedding, fEmbed)
          if (cosine >= EMBEDDING_DEDUP_THRESHOLD) {
            return f  // 楂樼疆淇＄洿鎺ヨ繑鍥?
          }
        }
      }

      // Jaccard 鍘婚噸锛堝厹搴曪級
      const fSet = charSet(`${f.subject} ${f.summary}`)
      if (fSet.size < 2) continue
      let intersect = 0
      for (const ch of qSet) {
        if (fSet.has(ch)) intersect++
      }
      const union = new Set([...qSet, ...fSet])
      const sim = intersect / union.size
      if (sim >= FACT_DEDUP_THRESHOLD && sim > bestSim) {
        bestMatch = f
        bestSim = sim
      }
    }
    return bestMatch
  }

  /** 璇︾粏鐗堬細杩斿洖 AddFactResult锛堝惈 isNew/mergedWith锛夛紝鐢ㄤ簬 ingest 绠＄嚎 */
  addFactDetailed(raw: {
    domain: string
    subcategory: string
    subject: string
    summary: string
    weight?: number
    confidence?: number
    selfRelevance?: number
    triggers?: string[]
    sourceSessionId: string
    sourceTurnIndex: number
    emotionalContext: EmotionalContext
    derivedFrom?: string[]
    factLayer?: FactLayer
    embedding?: number[]
    privacyLevel?: MemoryFact['privacyLevel']
    ageMeta?: { age: number; birthdayMMDD?: string; birthYear?: number; recordedAt: string; isEstimate: boolean }
  }): AddFactResult {
    return this._addFactImpl(raw)
  }

  /** 鍚戝悗鍏煎锛氳繑鍥?MemoryFact锛岀敤浜庢祴璇曞拰鏃ц皟鐢ㄦ柟 */
  addFact(raw: {
    domain: string
    subcategory: string
    subject: string
    summary: string
    weight?: number
    confidence?: number
    selfRelevance?: number
    triggers?: string[]
    sourceSessionId: string
    sourceTurnIndex: number
    emotionalContext: EmotionalContext
    derivedFrom?: string[]
    factLayer?: FactLayer
    privacyLevel?: MemoryFact['privacyLevel']
  }): MemoryFact {
    return this._addFactImpl(raw).fact
  }

  private _addFactImpl(raw: {
    domain: string
    subcategory: string
    subject: string
    summary: string
    weight?: number
    confidence?: number
    selfRelevance?: number
    triggers?: string[]
    sourceSessionId: string
    sourceTurnIndex: number
    emotionalContext: EmotionalContext
    derivedFrom?: string[]
    factLayer?: FactLayer
    embedding?: number[]
    privacyLevel?: MemoryFact['privacyLevel']
    ageMeta?: { age: number; birthdayMMDD?: string; birthYear?: number; recordedAt: string; isEstimate: boolean }
  }): AddFactResult {
    const sub = raw.subcategory as Subcategory
    const meta = isValidSubcategory(sub) ? CATEGORY_META[sub] : CATEGORY_META.MOOD
    const now = new Date().toISOString()
    const incomingConfidence = normalizeConfidence(raw.confidence ?? meta.defaultConfidence)

    // O1: 浜嬪疄鍘婚噸 鈥?Embedding + Jaccard 鍙屾潯浠?
    const existing = this.findSimilarFact(sub, raw.subject, raw.summary, raw.domain, raw.embedding, this._embeddingCache)
    if (existing) {
      existing.weight = Math.max(existing.weight, raw.weight ?? meta.defaultWeight) + FACT_DEDUP_WEIGHT_BOOST
      existing.confidence = Math.max(normalizeConfidence(existing.confidence), incomingConfidence)
      existing.triggers = [...new Set([...existing.triggers, ...(raw.triggers ?? [])])]
      if (raw.summary.length > existing.summary.length) {
        existing.summary = raw.summary
      }
      existing.emotionalContext = raw.emotionalContext
      existing.privacyLevel = mostRestrictivePrivacy(existing.privacyLevel, raw.privacyLevel)
      existing.updatedAt = now
      existing.updateTrail = [...existing.updateTrail, now]
      // B: 鍚堝苟鍚庤嫢鏉冮噸瓒呰繃闃堝€硷紝鎻愬崌涓烘牳蹇冭蹇?
      if (!existing.tier || existing.tier !== 'core') {
        if (existing.weight >= CORE_MEMORY_WEIGHT_THRESHOLD) {
          existing.tier = 'core'
          this.autoDemoteExcessCores()
        }
      }
      if (this.useDb) {
        updateFactInDb(this.dataRoot, existing)
      } else {
        this.persist()
      }
      return { fact: existing, isNew: false, mergedWith: existing.id }
    }

    const fact: MemoryFact = {
      id: randomUUID(),
      domain: raw.domain,
      subcategory: raw.subcategory,
      subject: raw.subject,
      summary: raw.summary,
      weight: raw.weight ?? meta.defaultWeight,
      confidence: incomingConfidence,
      status: 'active',
      emotionalContext: raw.emotionalContext,
      selfRelevance: raw.selfRelevance ?? meta.selfRelevance,
      triggers: raw.triggers ?? [],
      updateTrail: [now],
      sourceSessionId: raw.sourceSessionId,
      sourceTurnIndex: raw.sourceTurnIndex,
      createdAt: now,
      updatedAt: now,
      derivedFrom: raw.derivedFrom,
      factLayer: raw.factLayer ?? 'raw',
      tier: raw.factLayer === 'consolidated' ? 'core' : undefined,
      privacyLevel: raw.privacyLevel ?? 'normal',
      ageMeta: raw.ageMeta
    }
    // B: 鑷姩鎻愬崌鈥斺€旈珮鏉冮噸浜嬪疄鑷姩鎴愪负鏍稿績璁板繂
    if (!fact.tier && fact.weight >= CORE_MEMORY_WEIGHT_THRESHOLD) {
      fact.tier = 'core'
      this.autoDemoteExcessCores()
    }
    this.facts.push(fact)
    this.byId.set(fact.id, fact)
    if (this.useDb) {
      insertFact(this.dataRoot, fact)
    } else {
      this.persist()
    }
    return { fact, isNew: true }
  }

  updateFact(
    id: string,
    patch: Partial<Pick<MemoryFact, 'summary' | 'weight' | 'confidence' | 'triggers' | 'sensitivity' | 'tier' | 'privacyLevel'>>
  ): boolean {
    const f = this.facts.find((x) => x.id === id)
    if (!f) return false
    const normalized = patch.confidence !== undefined
      ? { ...patch, confidence: normalizeConfidence(patch.confidence) }
      : patch
    if (normalized.privacyLevel) {
      normalized.privacyLevel = mostRestrictivePrivacy(f.privacyLevel, normalized.privacyLevel)
    }
    Object.assign(f, normalized, { updatedAt: new Date().toISOString() })
    if (this.useDb) {
      updateFactInDb(this.dataRoot, f)
    } else {
      this.persist()
    }
    return true
  }

  retireFact(id: string): boolean {
    const f = this.facts.find((x) => x.id === id)
    if (!f) return false
    f.status = 'retired'
    f.updatedAt = new Date().toISOString()
    if (this.useDb) {
      updateFactInDb(this.dataRoot, f)
    } else {
      this.persist()
    }
    return true
  }

  /** 鍚嶅瓧闄嶆潈锛氭柊澧炲悕瀛楁椂锛屽悓 subject 鐨勬棫鍚嶅瓧 weight-1 */
  downgradeNameFacts(subject: string): void {
    for (const f of this.facts) {
      if (
        f.subcategory === 'BASIC_PROFILE' &&
        (f.subject === '鐢ㄦ埛濮撳悕' || f.subject === '鐢ㄦ埛鏄电О') &&
        f.subject === subject &&
        f.weight > 0 &&
        f.status === 'active'
      ) {
        f.weight = Math.max(0, f.weight - 1)
        f.updatedAt = new Date().toISOString()
        if (this.useDb) {
          updateFactInDb(this.dataRoot, f)
        }
      }
    }
    if (!this.useDb) this.persist()
  }

  autoRetireExpired(): void {
    const now = Date.now()
    for (const f of this.facts) {
      if (f.status !== 'active') continue
      const meta = isValidSubcategory(f.subcategory as string) ? CATEGORY_META[f.subcategory as Subcategory] : null
      const days = meta?.autoRetireDays
      if (!days) continue
      const age = (now - new Date(f.createdAt).getTime()) / 86400000
      if (age >= days && ['NOW', 'PLANS', 'WORLD'].includes(f.subcategory)) {
        f.status = 'retired'
        f.updatedAt = new Date().toISOString()
        if (this.useDb) {
          updateFactInDb(this.dataRoot, f)
        }
      }
    }
    if (!this.useDb) this.persist()
  }
}

export function defaultFactsPath(dataRoot: string): string {
  return join(dataRoot, 'memory', 'facts', 'facts.v2.json')
}
