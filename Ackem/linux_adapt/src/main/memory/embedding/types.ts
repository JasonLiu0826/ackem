// [embedding/types] — Embedding 系统接口定义
// 职责：EmbeddingProvider 接口、模型清单、状态类型
// 引用：无（纯类型文件）

/** 统一 embedding 提供者接口 — 所有实现（本地 ONNX / 远程 API）都遵守此接口 */
export interface EmbeddingProvider {
  /** 单条文本 → 向量 */
  embed(text: string): Promise<number[]>
  /** 批量文本 → 向量数组（顺序与输入一致） */
  embedBatch(texts: string[]): Promise<number[][]>
  /** 向量维度 */
  dimension(): number
  /** 提供者标识，如 "local:bge-small-zh" | "remote:deepseek" */
  name(): string
  /** 模型是否已加载就绪 */
  ready(): boolean
  /** 释放资源（onnxruntime session 等） */
  dispose(): void
}

/** 已支持的本地模型 ID */
export type LocalModelId = 'bge-small-zh' | 'bge-small-en' | 'm3e-small' | 'bge-base-zh'

/** 模型清单条目 */
export interface ModelManifest {
  id: LocalModelId
  /** 向量维度 */
  dimension: number
  /** 压缩包大小 MB */
  compressedSizeMb: number
  /** 解压后大小 MB */
  extractedSizeMb: number
  /** bundled = 安装包内置, downloadable = 需下载 */
  source: 'bundled' | 'downloadable'
  /** 下载地址（GitHub Releases） */
  downloadUrl?: string
  /** 国内镜像地址 */
  mirrorUrl?: string
  /** 中文效果评级描述 */
  qualityLabel: string
  /** 单条推理延迟描述 */
  speedLabel: string
  /** 推理内存占用描述 */
  memoryLabel: string
}

/** .model-state.json 持久化结构 */
export interface ModelState {
  activeModel: LocalModelId | 'none'
  version: string
  activatedAt: string
  dimension: number
  provider: 'onnxruntime' | 'none'
}

/** 远程 embedding API 配置 */
export interface RemoteEmbeddingConfig {
  url: string
  model: string
  apiKey?: string
}

/** provider 创建选项 */
export interface EmbeddingProviderOptions {
  dataRoot: string
  /** 当前激活的本地模型 ID，'none' = 不加载本地模型 */
  activeModel: LocalModelId | 'none'
  /** 远程 API 配置（可选） */
  remote?: RemoteEmbeddingConfig
}

/** 安装包预装的中英文 embedding 模型（FIX-012） */
export const BUNDLED_EMBEDDING_MODEL_IDS = ['bge-small-zh', 'bge-small-en'] as const satisfies readonly LocalModelId[]

export function isBundledEmbeddingModel(id: LocalModelId): boolean {
  return (BUNDLED_EMBEDDING_MODEL_IDS as readonly LocalModelId[]).includes(id)
}

/** 所有模型的静态清单 */
export const MODEL_MANIFESTS: ModelManifest[] = [
  {
    id: 'bge-small-zh',
    dimension: 512,
    compressedSizeMb: 35,
    extractedSizeMb: 90,
    source: 'bundled',
    downloadUrl: 'https://github.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-zh-v1.5.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-zh-v1.5.onnx.zip',
    qualityLabel: '中文效果 ★★★★',
    speedLabel: '< 10ms',
    memoryLabel: '~150MB'
  },
  {
    id: 'bge-small-en',
    dimension: 512,
    compressedSizeMb: 40,
    extractedSizeMb: 130,
    source: 'bundled',
    downloadUrl: 'https://github.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-en-v1.5.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-en-v1.5.onnx.zip',
    qualityLabel: 'English ★★★★',
    speedLabel: '< 10ms',
    memoryLabel: '~150MB'
  },
  {
    id: 'm3e-small',
    dimension: 512,
    compressedSizeMb: 35,
    extractedSizeMb: 90,
    source: 'downloadable',
    downloadUrl: 'https://github.com/nicepkg/ackem-models/releases/download/v1.0/m3e-small.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/ackem-models/releases/download/v1.0/m3e-small.onnx.zip',
    qualityLabel: '中文效果 ★★★★',
    speedLabel: '< 10ms',
    memoryLabel: '~150MB'
  },
  {
    id: 'bge-base-zh',
    dimension: 768,
    compressedSizeMb: 150,
    extractedSizeMb: 400,
    source: 'downloadable',
    downloadUrl: 'https://github.com/nicepkg/ackem-models/releases/download/v1.0/bge-base-zh-v1.5.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/ackem-models/releases/download/v1.0/bge-base-zh-v1.5.onnx.zip',
    qualityLabel: '中文效果 ★★★★★（最好）',
    speedLabel: '20-30ms',
    memoryLabel: '~500MB'
  }
]

export function getModelManifest(id: LocalModelId): ModelManifest | undefined {
  return MODEL_MANIFESTS.find(m => m.id === id)
}
