// [activeRecall] 鈥?涓诲姩鍥炲繂
// 鑱岃矗锛氬湪鍚堥€傜殑鏃舵満锛屼即渚ｄ富鍔ㄦ彁璧锋棫璁板繂锛屽舰鎴?鑷劧鎯宠捣"鐨勫璇濅綋楠?
// 瀵规爣 MemGPT recall memory / Character.AI 涓诲姩璇濋
// 寮曠敤锛?./engine/AckemParams, ../engine/types, ./factStore

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ACTIVE_RECALL_MIN_INTERVAL, ACTIVE_RECALL_PROBABILITY } from '../engine/AckemParams'
import type { MemoryFact } from '../engine/types'
import type { FactStore } from './factStore'
import { cosineSimilarity } from './factEmbeddingCache'

export type RecallRecord = { factId: string; recalledAtTurn: number }

export class ActiveRecall {
  private history: RecallRecord[] = []
  private autoSavePath: string | null = null

  setPersistencePath(filePath: string): void {
    this.autoSavePath = filePath
    this.load(filePath)
  }

  load(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf-8')) as { history: RecallRecord[] }
        this.history = Array.isArray(data.history) ? data.history : []
      }
    } catch { this.history = [] }
  }

  save(filePath: string): void {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify({ history: this.history }), 'utf-8')
  }

  /**
   * 鎸戦€変富鍔ㄥ洖蹇嗗€欓€夛紙鏃犲壇浣滅敤锛屼緵 topicSelector 浠茶鍚庡啀 markRecalled锛?
   */
  selectRecallCandidate(
    factStore: FactStore,
    currentTurn: number,
    /** deterministic RNG in [0,1) for testability */
    rng?: number,
    conversationEmbed?: number[]
  ): { prompt: string; factId: string } | null {
    const roll = rng ?? Math.random()
    if (roll >= ACTIVE_RECALL_PROBABILITY) return null

    factStore.load()
    const cores = factStore.getCoreFacts()
    if (cores.length === 0) return null

    const recentIds = new Set(
      this.history
        .filter(r => currentTurn - r.recalledAtTurn < ACTIVE_RECALL_MIN_INTERVAL)
        .map(r => r.factId)
    )
    const candidates = cores.filter(f => !recentIds.has(f.id))
    if (candidates.length === 0) return null

    const baseWeights = candidates.map(f => {
      const records = this.history.filter(r => r.factId === f.id)
      const lastRecall = records.length > 0 ? records[records.length - 1] : null
      const turnsSinceRecall = lastRecall ? currentTurn - lastRecall.recalledAtTurn : ACTIVE_RECALL_MIN_INTERVAL
      return f.selfRelevance * f.emotionalContext.intensity * Math.min(1, turnsSinceRecall / ACTIVE_RECALL_MIN_INTERVAL)
    })

    let weights = baseWeights
    try {
      if (conversationEmbed && conversationEmbed.length > 0 && factStore._embeddingCache) {
        weights = candidates.map((f, i) => {
          const factEmbed = factStore._embeddingCache?.get(f.id)
          if (!factEmbed || factEmbed.length === 0) return baseWeights[i]
          const semanticScore = cosineSimilarity(conversationEmbed, factEmbed)
          return baseWeights[i] * 0.5 + semanticScore * 0.5
        })
      }
    } catch { /* 闄嶇骇锛氱敤鍩虹鏉冮噸 */ }
    const totalW = weights.reduce((a, b) => a + b, 0)
    if (totalW <= 0) return null

    const r = (rng ?? Math.random()) * totalW
    let cumulative = 0
    let selected: MemoryFact | null = null
    for (let i = 0; i < candidates.length; i++) {
      cumulative += weights[i]
      if (r <= cumulative) {
        selected = candidates[i]
        break
      }
    }
    if (!selected) selected = candidates[0]

    return { prompt: this.formatRecall(selected), factId: selected.id }
  }

  /**
   * 灏濊瘯瑙﹀彂涓€娆′富鍔ㄥ洖蹇?
   * @param conversationEmbed 鏈€杩戝璇濈殑 Embedding锛堝彲閫夛紝鐢ㄤ簬璇箟閫夋棫浜嬶級
   * @returns 鍥炲繂鎻愮ず鏂囨湰锛岃嫢涓嶅簲瑙﹀彂鍒欒繑鍥?null
   */
  tryRecall(
    factStore: FactStore,
    currentTurn: number,
    /** deterministic RNG in [0,1) for testability */
    rng?: number,
    conversationEmbed?: number[]
  ): string | null {
    const selected = this.selectRecallCandidate(factStore, currentTurn, rng, conversationEmbed)
    if (!selected) return null

    this.history.push({ factId: selected.factId, recalledAtTurn: currentTurn })
    if (this.history.length > 100) {
      this.history = this.history.slice(-50)
    }
    if (this.autoSavePath) this.save(this.autoSavePath)

    return selected.prompt
  }

  private formatRecall(fact: MemoryFact): string {
    const sub = fact.subject
    const sum = fact.summary
    const phrases = [
      `璇磋捣鏉ワ紝涔嬪墠璁板緱${sub.includes('鍠滄') ? `浣?{sub}` : `浣犳彁鍒拌繃${sub}`}銆?{sum.slice(0, 40)}`,
      `绐佺劧鎯冲埌锛屼綘涔嬪墠璇磋繃${sub}銆傜幇鍦ㄨ繕鏄繖鏍峰悧锛焋,
      `瀵逛簡锛?{sub}鐨勪簨鎴戜竴鐩磋鐫€銆?{sum.length < 50 ? sum : ''}`,
      `鎴戣寰椾綘涔嬪墠${sub}锛屾渶杩戞湁浠€涔堟柊鐨勫彉鍖栧悧锛焋
    ]
    return phrases[Math.floor(Math.random() * phrases.length)].slice(0, 120)
  }

  /** 鎵嬪姩鏍囪鏌愪簨瀹炲凡琚洖蹇嗭紙閬垮厤 LLM 宸蹭富鍔ㄦ彁璧蜂絾鎴戜滑鍙堥噸澶嶏級 */
  markRecalled(factId: string, currentTurn: number): void {
    this.history.push({ factId, recalledAtTurn: currentTurn })
  }

  getHistory(): RecallRecord[] {
    return [...this.history]
  }

  clear(): void {
    this.history = []
  }
}
