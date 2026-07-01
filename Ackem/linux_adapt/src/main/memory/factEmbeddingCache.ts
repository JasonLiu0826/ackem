// [factEmbeddingCache] — 事实 Embedding 缓存
// 职责：管理事实的 embedding 向量缓存，支持 O(1) 查询
// 用途：写入端去重、主动遗忘、关联强度门控
// 引用：无独立依赖

import type { MemoryFact } from '../engine/types'
import type { EmbeddingProvider } from './embedding'
import { createLogger } from '../logger'

const log = createLogger('fact-embed-cache')

export class FactEmbeddingCache {
  private cache = new Map<string, number[]>()
  private modelSignature = ''

  /** 检查模型是否切换，需要重建缓存 */
  needsRebuild(provider: EmbeddingProvider): boolean {
    return this.modelSignature !== '' && this.modelSignature !== provider.name()
  }

  /** 启动时批量构建缓存 */
  async build(facts: MemoryFact[], provider: EmbeddingProvider): Promise<void> {
    if (!provider.ready()) return
    const active = facts.filter(f => f.status === 'active')
    if (active.length === 0) return

    try {
      // 模型切换 → 清空旧缓存（维度不匹配）
      if (this.modelSignature && this.modelSignature !== provider.name()) {
        log.info('Embedding 模型切换，清空旧缓存', { old: this.modelSignature, new: provider.name() })
        this.clear()
      }
      const texts = active.map(f => `${f.subject} ${f.summary}`)
      const embeddings = await provider.embedBatch(texts)
      for (let i = 0; i < active.length; i++) {
        if (embeddings[i] && embeddings[i].length > 0) {
          this.cache.set(active[i].id, embeddings[i])
        }
      }
      this.modelSignature = provider.name()
      log.info('Embedding 缓存构建完成', { count: this.cache.size, model: this.modelSignature })
    } catch (e) {
      log.warn('Embedding 缓存构建失败', { error: String(e) })
    }
  }

  /** 单条事实的 embedding（写入时调用） */
  set(factId: string, embedding: number[]): void {
    this.cache.set(factId, embedding)
  }

  /** 获取缓存 */
  get(factId: string): number[] | undefined {
    return this.cache.get(factId)
  }

  /** 删除缓存（事实退役/删除时） */
  delete(factId: string): void {
    this.cache.delete(factId)
  }

  /** 清空 */
  clear(): void {
    this.cache.clear()
  }

  /** 缓存大小 */
  size(): number {
    return this.cache.size
  }
}

/** 余弦相似度（纯函数，无副作用） */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}
