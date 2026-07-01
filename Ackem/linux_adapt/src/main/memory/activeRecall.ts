// [activeRecall] — 主动回忆
// 职责：在合适的时机，伴侣主动提起旧记忆，形成"自然想起"的对话体验
// 对标 MemGPT recall memory / Character.AI 主动话题
// 引用：../engine/ackemParams, ../engine/types, ./factStore

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ACTIVE_RECALL_MIN_INTERVAL, ACTIVE_RECALL_PROBABILITY } from '../engine/ackemParams'
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
   * 挑选主动回忆候选（无副作用，供 topicSelector 仲裁后再 markRecalled）
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
    } catch { /* 降级：用基础权重 */ }
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
   * 尝试触发一次主动回忆
   * @param conversationEmbed 最近对话的 Embedding（可选，用于语义选旧事）
   * @returns 回忆提示文本，若不应触发则返回 null
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
      `说起来，之前记得${sub.includes('喜欢') ? `你${sub}` : `你提到过${sub}`}。${sum.slice(0, 40)}`,
      `突然想到，你之前说过${sub}。现在还是这样吗？`,
      `对了，${sub}的事我一直记着。${sum.length < 50 ? sum : ''}`,
      `我记得你之前${sub}，最近有什么新的变化吗？`
    ]
    return phrases[Math.floor(Math.random() * phrases.length)].slice(0, 120)
  }

  /** 手动标记某事实已被回忆（避免 LLM 已主动提起但我们又重复） */
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
