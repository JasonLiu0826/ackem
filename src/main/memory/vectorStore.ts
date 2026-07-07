// [vectorStore] 鈥?TF-IDF 鍚戦噺璇箟鎼滅储
// 鑱岃矗锛氬皢浜嬪疄鍚戦噺鍖栦负 TF-IDF 绋€鐤忓悜閲忥紝鏀寔浣欏鸡鐩镐技搴︽绱?
// 瀵规爣 MemGPT / OpenAI Memory 鐨?embedding 鎼滅储
// 鍙€夋敞鍏?embedQuery 鍑芥暟浠ヤ娇鐢ㄥ閮?embedding 妯″瀷鏇夸唬 TF-IDF
// 寮曠敤锛?./engine/types

import { VECTOR_SEARCH_MIN_SCORE } from '../engine/AckemParams'
import type { MemoryFact } from '../engine/types'

type SparseVec = Map<number, number>

/** 澶栭儴 embedding 鍑芥暟绛惧悕锛氳緭鍏ユ枃鏈紝杈撳嚭 N 缁存诞鐐瑰悜閲?*/
export type EmbedFn = (text: string) => Promise<number[]> | number[]

export class VectorStore {
  private idf = new Map<string, number>()
  private vectors: Array<{ factId: string; vec: SparseVec; norm: number }> = []
  private termToId = new Map<string, number>()
  private nextId = 0
  private lastFactHash = ''
  /** 鍙€夊閮?embedding 鍑芥暟锛屾彁渚涘悗鐢ㄤ簬鏌ヨ鍚戦噺鍖?*/
  embedQuery?: EmbedFn
  /** 鍙€夋壒閲?embedding 鍑芥暟锛岀敤浜庢瀯寤轰簨瀹炵殑绋犲瘑鍚戦噺缂撳瓨 */
  embedFacts?: (texts: string[]) => Promise<number[][]>
  /** 绋犲瘑鍚戦噺缂撳瓨锛坋mbedding 绌洪棿锛夛紝涓?TF-IDF 绋€鐤忓悜閲忕嫭绔?*/
  private denseVectors: Array<{ factId: string; vec: number[]; norm: number }> = []
  private denseLastHash = ''

  /** Rebuild vocabulary and vectors from all active facts锛堣烦杩囨湭鍙樻洿鏃讹級 */
  build(facts: MemoryFact[]): void {
    // 鐢ㄦ€绘潯鏁?鎵€鏈夋椂闂存埑姹傚拰鐨?hash 妫€娴嬩簨瀹炲簱鍙樻洿锛屼换涓€浜嬪疄澧炲垹鏀归兘浼氳Е鍙戦噸寤?
    const totalUpdated = facts.reduce((sum, f) => sum + new Date(f.updatedAt).getTime(), 0)
    const hash = `${facts.length}-${totalUpdated}`
    if (hash === this.lastFactHash && this.vectors.length > 0) return
    this.lastFactHash = hash
    this.termToId.clear()
    this.idf.clear()
    this.vectors = []
    this.nextId = 0

    const docs = facts.filter(f => f.status === 'active').map(f => this.tokenize(f))

    // Compute document frequency
    for (const tokens of docs) {
      const seen = new Set<string>()
      for (const t of tokens) {
        if (seen.has(t)) continue
        seen.add(t)
        this.idf.set(t, (this.idf.get(t) ?? 0) + 1)
      }
    }

    // Compute IDF
    const N = docs.length
    for (const [term, df] of this.idf) {
      this.idf.set(term, Math.log((1 + N) / (1 + df)) + 1)
      this.termToId.set(term, this.nextId++)
    }

    // Build vectors
    for (let i = 0; i < facts.length; i++) {
      if (facts[i].status !== 'active') continue
      const tokens = docs[i]
      const tf = new Map<string, number>()
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1)
      }
      const vec = new Map<number, number>()
      let norm = 0
      for (const [term, count] of tf) {
        const id = this.termToId.get(term)
        const idfVal = this.idf.get(term)
        if (id === undefined || idfVal === undefined) continue
        // Normalized TF * IDF
        const val = (count / Math.max(...tf.values())) * idfVal
        vec.set(id, val)
        norm += val * val
      }
      norm = Math.sqrt(norm) || 1
      this.vectors.push({ factId: facts[i].id, vec, norm })
    }
  }

  /** 浣跨敤 embedding 鐨勫紓姝ユ悳绱紙鑻ュ彲鐢級锛屽洖閫€ TF-IDF */
  async searchAsync(
    query: string,
    topK: number,
    queryEmbed?: number[]
  ): Promise<Array<{ factId: string; score: number }>> {
    if (this.denseVectors.length > 0) {
      try {
        const qEmbed =
          queryEmbed && queryEmbed.length > 0
            ? queryEmbed
            : this.embedQuery
              ? await this.embedQuery(query)
              : null
        if (qEmbed && qEmbed.length > 0) {
          return this.searchByDenseVector(qEmbed, topK)
        }
      } catch { /* fall back to TF-IDF */ }
    }
    return this.search(query, topK)
  }

  isDenseCacheReady(): boolean {
    return this.denseVectors.length > 0
  }

  /** 瀵煎嚭绋犲瘑鍚戦噺鍒?Map锛堜緵 factStore._embeddingCache 鎸傝浇锛?*/
  syncDenseCacheToMap(): Map<string, number[]> {
    const map = new Map<string, number[]>()
    for (const { factId, vec } of this.denseVectors) {
      map.set(factId, vec)
    }
    return map
  }

  /** 浠庡閮?Map / SQLite 鍔犺浇濉厖绋犲瘑缂撳瓨 */
  loadDenseCacheFromMap(
    entries: Map<string, number[]>,
    corpusHash: string
  ): void {
    this.denseVectors = []
    for (const [factId, vec] of entries) {
      if (!vec.length) continue
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
      this.denseVectors.push({ factId, vec, norm })
    }
    this.denseLastHash = corpusHash
  }

  getDenseCorpusHash(): string {
    return this.denseLastHash
  }

  /** 寮傛鏋勫缓绋犲瘑鍚戦噺缂撳瓨锛堝湪 build() 涔嬪悗璋冪敤锛岄渶瑕?embedFacts 鍙敤锛?*/
  async buildDenseCache(facts: MemoryFact[]): Promise<void> {
    if (!this.embedFacts) return
    const active = facts.filter(f => f.status === 'active')
    if (active.length === 0) return

    const hash = active.map(f => f.id).join(',')
    if (hash === this.denseLastHash && this.denseVectors.length > 0) return

    try {
      const texts = active.map(f => `${f.subject} ${f.summary} ${f.triggers.join(' ')}`)
      const embeddings = await this.embedFacts(texts)
      this.denseVectors = active.map((f, i) => {
        const vec = embeddings[i] ?? []
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
        return { factId: f.id, vec, norm }
      })
      this.denseLastHash = hash
    } catch {
      this.denseVectors = []
    }
  }

  /** 鐢ㄧ瀵?embedding 鍚戦噺鍋氫綑寮︾浉浼煎害鎼滅储 */
  private searchByDenseVector(qVec: number[], topK: number): Array<{ factId: string; score: number }> {
    const qNorm = Math.sqrt(qVec.reduce((s, v) => s + v * v, 0)) || 1
    const scored = this.denseVectors.map(({ factId, vec, norm }) => {
      let dot = 0
      for (let i = 0; i < qVec.length && i < vec.length; i++) {
        dot += qVec[i] * vec[i]
      }
      return { factId, score: dot / (qNorm * norm) }
    })
    return scored.filter(({ score }) => score > VECTOR_SEARCH_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /** TF-IDF cosine similarity search (synchronous, default) */
  search(query: string, topK: number): Array<{ factId: string; score: number }> {
    if (this.vectors.length === 0) return []

    const queryVec = this.vectorizeQuery(query)
    if (queryVec.size === 0) return []

    const qNorm = Math.sqrt([...queryVec.values()].reduce((s, v) => s + v * v, 0)) || 1

    const scored = this.vectors.map(({ factId, vec, norm }) => {
      let dot = 0
      for (const [id, qv] of queryVec) {
        dot += qv * (vec.get(id) ?? 0)
      }
      const score = dot / (qNorm * norm)
      return { factId, score }
    })

    return scored
      .filter(({ score }) => score > VECTOR_SEARCH_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /** Match vector search results back to MemoryFact objects */
  resolveFacts(
    results: Array<{ factId: string; score: number }>,
    facts: MemoryFact[]
  ): MemoryFact[] {
    const factMap = new Map(facts.map(f => [f.id, f]))
    return results
      .map(r => factMap.get(r.factId))
      .filter((f): f is MemoryFact => f !== undefined)
  }

  private tokenize(fact: MemoryFact): string[] {
    const text = `${fact.subject} ${fact.summary} ${fact.triggers.join(' ')}`.toLowerCase()
    // Split on CJK punctuation, whitespace, and keep 1-char CJK + 2-char words
    const words = text.split(/[\s,锛屻€傦紒锛熴€侊紱锛?"''锛堬級銆愩€戙€娿€?!?;:()\[\]{}"']+/u).filter(w => w.length >= 1)
    const tokens: string[] = []
    for (const w of words) {
      // Full word
      if (w.length >= 2) tokens.push(w)
      // Character bigrams for CJK
      for (let i = 0; i <= w.length - 2; i++) {
        tokens.push(w.slice(i, i + 2))
      }
    }
    return tokens.filter(t => t.length >= 1)
  }

  private vectorizeQuery(query: string): SparseVec {
    const tokens = query.toLowerCase()
      .split(/[\s,锛屻€傦紒锛熴€侊紱锛?"''锛堬級銆愩€戙€娿€?!?;:()\[\]{}"']+/u)
      .filter(w => w.length >= 1)
    const bigrams: string[] = []
    for (const w of tokens) {
      if (w.length >= 2) bigrams.push(w)
      for (let i = 0; i <= w.length - 2; i++) {
        bigrams.push(w.slice(i, i + 2))
      }
    }
    const tf = new Map<string, number>()
    for (const t of bigrams) {
      tf.set(t, (tf.get(t) ?? 0) + 1)
    }
    const vec = new Map<number, number>()
    const maxTf = Math.max(...tf.values(), 1)
    for (const [term, count] of tf) {
      const id = this.termToId.get(term)
      const idfVal = this.idf.get(term) ?? 1
      if (id === undefined) continue
      vec.set(id, (count / maxTf) * idfVal)
    }
    return vec
  }

  count(): number {
    return this.vectors.length
  }
}
