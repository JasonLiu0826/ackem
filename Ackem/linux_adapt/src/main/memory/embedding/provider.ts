// [embedding/provider] — Embedding Provider 门面
// 职责：管理 provider 生命周期，本地 ONNX → 远程 API → fallback 链
// 引用：./types, ./onnxProvider, ./modelManager
//
// 设计原则：
//   1. 外部只接触 EmbeddingProvider 接口，不关心内部实现
//   2. 本地模型不可用时自动降级，不抛异常
//   3. dispose() 释放所有资源

import type { EmbeddingProvider, EmbeddingProviderOptions, LocalModelId, RemoteEmbeddingConfig } from './types'
import { createOnnxProvider, isOnnxRuntimeAvailable } from './onnxProvider'
import { ensureModelExtracted, getModelState } from './modelManager'
import { createLogger } from '../../logger'

const log = createLogger('embedding')

/** 远程 API 实现 — 调用 OpenAI-compatible embedding endpoint */
class RemoteEmbeddingProvider implements EmbeddingProvider {
  private readonly dim: number
  private ready_ = false

  constructor(
    private readonly config: RemoteEmbeddingConfig,
    private readonly apiKey: string
  ) {
    this.dim = config.model.includes('small') ? 512 : 1536
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.callApi([text])
    return res[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.callApi(texts)
  }

  dimension(): number { return this.dim }
  name(): string { return `remote:${this.config.model}` }
  ready(): boolean { return this.ready_ }
  dispose(): void { this.ready_ = false }

  private async callApi(texts: string[]): Promise<number[][]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

    const res = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.config.model, input: texts })
    })

    if (!res.ok) {
      throw new Error(`Remote embedding API ${res.status}: ${await res.text().catch(() => res.statusText)}`)
    }

    const json = await res.json() as {
      data?: Array<{ embedding?: number[] }>
    }

    if (!json.data?.length) throw new Error('Remote embedding API returned empty data')
    this.ready_ = true
    return json.data.map(d => d.embedding ?? [])
  }
}

/** 空实现 — 当所有 provider 都不可用时使用，VectorStore 的 TF-IDF 兜底 */
class NoopEmbeddingProvider implements EmbeddingProvider {
  async embed(): Promise<number[]> { return [] }
  async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => []) }
  dimension(): number { return 0 }
  name(): string { return 'noop:fallback' }
  ready(): boolean { return false }
  dispose(): void {}
}

/**
 * 创建 EmbeddingProvider 实例。
 *
 * 优先级：
 *   1. 本地 ONNX 模型（如果已解压且 onnxruntime 可用）
 *   2. 远程 API（如果配置了 url + apiKey）
 *   3. Noop（VectorStore 的 TF-IDF 兜底）
 *
 * 注意：本函数不抛异常。任何错误都会降级到下一级。
 */
export async function createEmbeddingProvider(
  options: EmbeddingProviderOptions
): Promise<EmbeddingProvider> {
  const { dataRoot, activeModel, remote } = options

  // 1. 尝试本地 ONNX
  if (activeModel !== 'none') {
    try {
      const provider = await tryCreateLocalProvider(dataRoot, activeModel)
      if (provider) return provider
    } catch (e) {
      log.warn('本地 embedding 模型加载失败，降级', { model: activeModel, error: String(e) })
    }
  }

  // 2. 尝试远程 API
  if (remote?.url) {
    try {
      const provider = new RemoteEmbeddingProvider(remote, remote.apiKey ?? '')
      // 测试连通性（不阻塞太久）
      await Promise.race([
        provider.embed('test'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
      log.info('远程 embedding API 可用', { url: remote.url, model: remote.model })
      return provider
    } catch (e) {
      log.warn('远程 embedding API 不可用', { url: remote.url, error: String(e) })
    }
  }

  // 3. 兜底
  log.info('embedding provider 不可用，使用 TF-IDF 兜底')
  return new NoopEmbeddingProvider()
}

/** 尝试创建本地 ONNX provider */
async function tryCreateLocalProvider(
  dataRoot: string,
  modelId: LocalModelId
): Promise<EmbeddingProvider | null> {
  if (!isOnnxRuntimeAvailable()) {
    log.info('onnxruntime-node 不可用，跳过本地模型')
    return null
  }

  const extracted = ensureModelExtracted(modelId, dataRoot)
  if (!extracted) {
    log.info('模型未解压', { model: modelId })
    return null
  }

  const provider = createOnnxProvider(extracted.modelDir, modelId)
  await provider.init()
  log.info('本地 embedding 模型已加载', { model: modelId, dim: provider.dimension() })
  return provider
}

/** 获取当前活跃的 embedding provider 信息（用于 UI 显示） */
export function getProviderStatus(provider: EmbeddingProvider): {
  mode: 'local' | 'remote' | 'fallback'
  name: string
  ready: boolean
  dimension: number
} {
  const name = provider.name()
  const mode = name.startsWith('local:') ? 'local' : name.startsWith('remote:') ? 'remote' : 'fallback'
  return { mode, name, ready: provider.ready(), dimension: provider.dimension() }
}
