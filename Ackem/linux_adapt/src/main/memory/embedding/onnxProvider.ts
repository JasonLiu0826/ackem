// [embedding/onnxProvider] — 本地 ONNX 推理
// 职责：加载 ONNX 模型 + tokenizer，执行 embedding 推理
// 引用：./types
//
// 模型文件结构（解压后）：
//   {modelDir}/
//   ├── model.onnx
//   ├── tokenizer.json
//   └── config.json
//
// 推理流程：text → tokenize → InferenceSession.run → mean pooling → L2 normalize → float[]

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EmbeddingProvider, LocalModelId } from './types'

let ort: typeof import('onnxruntime-node') | null = null

/** 检测 onnxruntime-node 是否可用（optionalDependency） */
export function isOnnxRuntimeAvailable(): boolean {
  if (ort) return true
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ort = require('onnxruntime-node') as typeof import('onnxruntime-node')
    return true
  } catch {
    return false
  }
}

/** tokenizer.json 的简化结构 */
interface TokenizerJson {
  model?: {
    vocab?: Record<string, number>
    unk_token?: string
  }
  added_tokens?: Array<{ content?: string; id?: number; special?: boolean }>
}

/** config.json 的简化结构 */
interface ModelConfig {
  max_position_embeddings?: number
  hidden_size?: number
}

export class OnnxEmbeddingProvider implements EmbeddingProvider {
  private session: import('onnxruntime-node').InferenceSession | null = null
  private vocab = new Map<string, number>()
  private unkId = 100
  private maxLen = 512
  private dim = 512
  private readonly modelDir: string
  private readonly modelId: LocalModelId
  private initialized = false

  constructor(modelDir: string, modelId: LocalModelId) {
    this.modelDir = modelDir
    this.modelId = modelId
  }

  async init(): Promise<void> {
    if (!ort) {
      if (!isOnnxRuntimeAvailable()) {
        throw new Error('onnxruntime-node 不可用')
      }
    }

    const modelPath = join(this.modelDir, 'model.onnx')
    if (!existsSync(modelPath)) {
      throw new Error(`模型文件不存在: ${modelPath}`)
    }

    // 加载 tokenizer
    this.loadTokenizer()
    this.loadConfig()

    // 加载 ONNX 模型
    this.session = await ort!.InferenceSession.create(modelPath)
    this.initialized = true

    // 探测实际输出维度（覆盖 config.json 中的默认值）
    this.probeOutputDim()
  }

  async embed(text: string): Promise<number[]> {
    this.ensureReady()
    const batch = await this.embedBatchChunk([text])
    return batch[0] ?? []
  }

  /** 逐条推理（一致性测试对照） */
  async embedBatchSequential(texts: string[]): Promise<number[][]> {
    this.ensureReady()
    const results: number[][] = []
    for (const text of texts) {
      const { inputIds, attentionMask } = this.tokenize(text)
      results.push(await this.runInference(inputIds, attentionMask))
    }
    return results
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.ensureReady()
    if (texts.length === 0) return []
    const BATCH_SIZE = 8
    const results: number[][] = new Array(texts.length)
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE)
      const vecs = await this.embedBatchChunk(chunk)
      for (let j = 0; j < vecs.length; j++) {
        results[i + j] = vecs[j]
      }
    }
    return results
  }

  private async embedBatchChunk(texts: string[]): Promise<number[][]> {
    if (texts.length === 1) {
      const { inputIds, attentionMask } = this.tokenize(texts[0])
      return [await this.runInference(inputIds, attentionMask)]
    }
    const { inputIds, attentionMasks } = this.tokenizeBatch(texts)
    return this.runInferenceBatch(inputIds, attentionMasks)
  }

  dimension(): number { return this.dim }
  name(): string { return `local:${this.modelId}` }
  ready(): boolean { return this.initialized && this.session !== null }

  dispose(): void {
    if (this.session) {
      this.session.release()
      this.session = null
    }
    this.initialized = false
  }

  // ═══════════════════════════════════════════
  // Tokenizer
  // ═══════════════════════════════════════════

  private loadTokenizer(): void {
    const tokenizerPath = join(this.modelDir, 'tokenizer.json')
    if (!existsSync(tokenizerPath)) {
      throw new Error(`tokenizer.json 不存在: ${tokenizerPath}`)
    }

    const raw = JSON.parse(readFileSync(tokenizerPath, 'utf-8')) as TokenizerJson
    const vocabEntries = raw.model?.vocab
    if (!vocabEntries) throw new Error('tokenizer.json 缺少 model.vocab')

    for (const [token, id] of Object.entries(vocabEntries)) {
      this.vocab.set(token, id)
    }

    // 处理 added_tokens（特殊 token）
    if (raw.added_tokens) {
      for (const t of raw.added_tokens) {
        if (t.content && t.id !== undefined) {
          this.vocab.set(t.content, t.id)
        }
      }
    }

    // 常见特殊 token ID
    this.unkId = this.vocab.get('[UNK]') ?? this.vocab.get('<unk>') ?? 100
  }

  private loadConfig(): void {
    const configPath = join(this.modelDir, 'config.json')
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as ModelConfig
      if (raw.max_position_embeddings) this.maxLen = raw.max_position_embeddings
      if (raw.hidden_size) this.dim = raw.hidden_size
    }
  }

  /** 简化的 tokenize：BPE-like 字符级分词 + 子词匹配 */
  private tokenize(text: string): { inputIds: number[]; attentionMask: number[] } {
    const tokens: number[] = [this.cls()]
    const chars = text.toLowerCase().trim()

    // 逐字符查 vocab，同时尝试 2-char 匹配
    let i = 0
    while (i < chars.length && tokens.length < this.maxLen - 1) {
      // 尝试 2-char 匹配
      if (i + 1 < chars.length) {
        const bigram = chars.slice(i, i + 2)
        const id = this.vocab.get(bigram)
        if (id !== undefined) {
          tokens.push(id)
          i += 2
          continue
        }
      }
      // 单字符匹配
      const ch = chars[i]
      const id = this.vocab.get(ch)
      if (id !== undefined) {
        tokens.push(id)
      } else {
        // 尝试 ## 前缀（BERT-style wordpiece）
        const hashId = this.vocab.get(`##${ch}`)
        tokens.push(hashId ?? this.unkId)
      }
      i++
    }

    tokens.push(this.sep())

    // pad 到 maxLen
    const padId = this.pad()
    while (tokens.length < this.maxLen) tokens.push(padId)

    const attentionMask = tokens.map(t => t === padId ? 0 : 1)
    return { inputIds: tokens, attentionMask }
  }

  private cls(): number { return this.vocab.get('[CLS]') ?? this.vocab.get('<s>') ?? 101 }
  private sep(): number { return this.vocab.get('[SEP]') ?? this.vocab.get('</s>') ?? 102 }
  private pad(): number { return this.vocab.get('[PAD]') ?? this.vocab.get('<pad>') ?? 0 }

  // ═══════════════════════════════════════════
  // ONNX 推理
  // ═══════════════════════════════════════════

  /** 批量 tokenize：与单条 tokenize 相同，统一 pad 到 maxLen */
  private tokenizeBatch(texts: string[]): { inputIds: number[][]; attentionMasks: number[][] } {
    const padId = this.pad()
    const tokenized = texts.map((text) => {
      const tokens: number[] = [this.cls()]
      const chars = text.toLowerCase().trim()
      let i = 0
      while (i < chars.length && tokens.length < this.maxLen - 1) {
        if (i + 1 < chars.length) {
          const bigram = chars.slice(i, i + 2)
          const id = this.vocab.get(bigram)
          if (id !== undefined) {
            tokens.push(id)
            i += 2
            continue
          }
        }
        const ch = chars[i]
        const id = this.vocab.get(ch)
        if (id !== undefined) {
          tokens.push(id)
        } else {
          const hashId = this.vocab.get(`##${ch}`)
          tokens.push(hashId ?? this.unkId)
        }
        i++
      }
      tokens.push(this.sep())
      return tokens
    })

    const maxLen = this.maxLen

    const inputIds: number[][] = []
    const attentionMasks: number[][] = []
    for (const tokens of tokenized) {
      const ids = [...tokens]
      while (ids.length < maxLen) ids.push(padId)
      const attentionMask = ids.map((t) => (t === padId ? 0 : 1))
      inputIds.push(ids.slice(0, maxLen))
      attentionMasks.push(attentionMask)
    }
    return { inputIds, attentionMasks }
  }

  private async runInferenceBatch(
    batchInputIds: number[][],
    batchAttentionMasks: number[][]
  ): Promise<number[][]> {
    if (!this.session || !ort) throw new Error('ONNX session 未初始化')
    const B = batchInputIds.length
    const L = batchInputIds[0]?.length ?? 0
    if (B === 0 || L === 0) return []

    const flatIds = new BigInt64Array(B * L)
    const flatMask = new BigInt64Array(B * L)
    for (let b = 0; b < B; b++) {
      for (let l = 0; l < L; l++) {
        flatIds[b * L + l] = BigInt(batchInputIds[b][l] ?? 0)
        flatMask[b * L + l] = BigInt(batchAttentionMasks[b][l] ?? 0)
      }
    }

    const ids = new ort.Tensor('int64', flatIds, [B, L])
    const mask = new ort.Tensor('int64', flatMask, [B, L])
    const typeIds = new ort.Tensor('int64', new BigInt64Array(B * L), [B, L])

    const feeds: Record<string, import('onnxruntime-node').Tensor> = {
      input_ids: ids,
      attention_mask: mask,
      token_type_ids: typeIds,
    }

    const results = await this.session.run(feeds)
    const outputKey = Object.keys(results)[0]
    const output = results[outputKey]
    if (!output) throw new Error('ONNX 推理无输出')

    const data = output.data as Float32Array
    const shape = output.dims as number[]
    const out: number[][] = []

    if (shape.length === 2 && shape[0] === B) {
      const hiddenDim = shape[1]
      for (let b = 0; b < B; b++) {
        const pooled = new Float32Array(hiddenDim)
        for (let h = 0; h < hiddenDim; h++) pooled[h] = data[b * hiddenDim + h]
        out.push(this.l2Normalize(pooled, hiddenDim))
      }
      return out
    }

    if (shape.length === 3 && shape[0] === B) {
      const seqLen = shape[1]
      const hiddenDim = shape[2]
      for (let b = 0; b < B; b++) {
        const pooled = new Float32Array(hiddenDim)
        let validTokens = 0
        const attn = batchAttentionMasks[b]
        for (let s = 0; s < seqLen; s++) {
          if (!attn[s]) continue
          validTokens++
          for (let h = 0; h < hiddenDim; h++) {
            pooled[h] += data[(b * seqLen + s) * hiddenDim + h]
          }
        }
        if (validTokens > 0) {
          for (let h = 0; h < hiddenDim; h++) pooled[h] /= validTokens
        }
        out.push(this.l2Normalize(pooled, hiddenDim))
      }
      return out
    }

    throw new Error(`不支持的 batch 输出 shape: ${shape.join('x')}`)
  }

  private l2Normalize(pooled: Float32Array, hiddenDim: number): number[] {
    let norm = 0
    for (let h = 0; h < hiddenDim; h++) norm += pooled[h] * pooled[h]
    norm = Math.sqrt(norm) || 1
    const normalized = new Array<number>(hiddenDim)
    for (let h = 0; h < hiddenDim; h++) normalized[h] = pooled[h] / norm
    return normalized
  }

  private async runInference(inputIds: number[], attentionMask: number[]): Promise<number[]> {
    if (!this.session || !ort) throw new Error('ONNX session 未初始化')

    const ids = new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length])
    const mask = new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, attentionMask.length])
    const typeIds = new ort.Tensor('int64', new BigInt64Array(inputIds.length), [1, inputIds.length])

    // BGE/M3E 模型输入名
    const feeds: Record<string, import('onnxruntime-node').Tensor> = {
      input_ids: ids,
      attention_mask: mask,
      token_type_ids: typeIds
    }

    const results = await this.session.run(feeds)

    // 取 last_hidden_state（通常是第一个输出）
    const outputKey = Object.keys(results)[0]
    const output = results[outputKey]
    if (!output) throw new Error('ONNX 推理无输出')

    const data = output.data as Float32Array
    const shape = output.dims as number[]

    let hiddenDim: number
    let pooled: Float32Array

    if (shape.length === 2) {
      // [batch, hidden] — 模型已池化（如 bge-small-zh），直接使用
      hiddenDim = shape[1]
      pooled = new Float32Array(hiddenDim)
      for (let h = 0; h < hiddenDim; h++) pooled[h] = data[h]
    } else {
      // [batch, seq, hidden] — 需要 mean pooling（带 attention_mask 加权）
      const seqLen = shape[1]
      hiddenDim = shape[2]
      pooled = new Float32Array(hiddenDim)
      let validTokens = 0
      for (let s = 0; s < seqLen; s++) {
        if (attentionMask[s] === 0) continue
        validTokens++
        for (let h = 0; h < hiddenDim; h++) {
          pooled[h] += data[s * hiddenDim + h]
        }
      }
      if (validTokens > 0) {
        for (let h = 0; h < hiddenDim; h++) pooled[h] /= validTokens
      }
    }

    // L2 normalize
    return this.l2Normalize(pooled, hiddenDim)
  }

  /** 用一条空输入探测模型的实际输出维度 */
  private probeOutputDim(): void {
    if (!this.session || !ort) return
    try {
      const len = 4
      const ids = new ort.Tensor('int64', BigInt64Array.from([101n, 102n, 0n, 0n]), [1, len])
      const mask = new ort.Tensor('int64', BigInt64Array.from([1n, 1n, 0n, 0n]), [1, len])
      const types = new ort.Tensor('int64', new BigInt64Array(len), [1, len])
      // 同步探测：用 session.run 的 then 获取维度
      this.session.run({ input_ids: ids, attention_mask: mask, token_type_ids: types }).then(results => {
        const outKey = Object.keys(results)[0]
        const out = results[outKey]
        if (out && out.dims) {
          const shape = out.dims as number[]
          // 最后一个维度是 hidden size
          this.dim = shape[shape.length - 1]
        }
      }).catch(() => { /* 探测失败，保留 config 默认值 */ })
    } catch { /* 探测失败，保留 config 默认值 */ }
  }

  private ensureReady(): void {
    if (!this.initialized || !this.session) {
      throw new Error('OnnxEmbeddingProvider 未初始化，请先调用 init()')
    }
  }
}

/** 工厂函数 */
export function createOnnxProvider(modelDir: string, modelId: LocalModelId): OnnxEmbeddingProvider {
  return new OnnxEmbeddingProvider(modelDir, modelId)
}
