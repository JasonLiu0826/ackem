// [embedding/types] 鈥?Embedding 绯荤粺鎺ュ彛瀹氫箟
// 鑱岃矗锛欵mbeddingProvider 鎺ュ彛銆佹ā鍨嬫竻鍗曘€佺姸鎬佺被鍨?
// 寮曠敤锛氭棤锛堢函绫诲瀷鏂囦欢锛?

/** 缁熶竴 embedding 鎻愪緵鑰呮帴鍙?鈥?鎵€鏈夊疄鐜帮紙鏈湴 ONNX / 杩滅▼ API锛夐兘閬靛畧姝ゆ帴鍙?*/
export interface EmbeddingProvider {
  /** 鍗曟潯鏂囨湰 鈫?鍚戦噺 */
  embed(text: string): Promise<number[]>
  /** 鎵归噺鏂囨湰 鈫?鍚戦噺鏁扮粍锛堥『搴忎笌杈撳叆涓€鑷达級 */
  embedBatch(texts: string[]): Promise<number[][]>
  /** 鍚戦噺缁村害 */
  dimension(): number
  /** 鎻愪緵鑰呮爣璇嗭紝濡?"local:bge-small-zh" | "remote:deepseek" */
  name(): string
  /** 妯″瀷鏄惁宸插姞杞藉氨缁?*/
  ready(): boolean
  /** 閲婃斁璧勬簮锛坥nnxruntime session 绛夛級 */
  dispose(): void
}

/** 宸叉敮鎸佺殑鏈湴妯″瀷 ID */
export type LocalModelId = 'bge-small-zh' | 'bge-small-en' | 'm3e-small' | 'bge-base-zh'

/** 妯″瀷娓呭崟鏉＄洰 */
export interface ModelManifest {
  id: LocalModelId
  /** 鍚戦噺缁村害 */
  dimension: number
  /** 鍘嬬缉鍖呭ぇ灏?MB */
  compressedSizeMb: number
  /** 瑙ｅ帇鍚庡ぇ灏?MB */
  extractedSizeMb: number
  /** bundled = 瀹夎鍖呭唴缃? downloadable = 闇€涓嬭浇 */
  source: 'bundled' | 'downloadable'
  /** 涓嬭浇鍦板潃锛圙itHub Releases锛?*/
  downloadUrl?: string
  /** 鍥藉唴闀滃儚鍦板潃 */
  mirrorUrl?: string
  /** 涓枃鏁堟灉璇勭骇鎻忚堪 */
  qualityLabel: string
  /** 鍗曟潯鎺ㄧ悊寤惰繜鎻忚堪 */
  speedLabel: string
  /** 鎺ㄧ悊鍐呭瓨鍗犵敤鎻忚堪 */
  memoryLabel: string
}

/** .model-state.json 鎸佷箙鍖栫粨鏋?*/
export interface ModelState {
  activeModel: LocalModelId | 'none'
  version: string
  activatedAt: string
  dimension: number
  provider: 'onnxruntime' | 'none'
}

/** 杩滅▼ embedding API 閰嶇疆 */
export interface RemoteEmbeddingConfig {
  url: string
  model: string
  apiKey?: string
}

/** provider 鍒涘缓閫夐」 */
export interface EmbeddingProviderOptions {
  dataRoot: string
  /** 褰撳墠婵€娲荤殑鏈湴妯″瀷 ID锛?none' = 涓嶅姞杞芥湰鍦版ā鍨?*/
  activeModel: LocalModelId | 'none'
  /** 杩滅▼ API 閰嶇疆锛堝彲閫夛級 */
  remote?: RemoteEmbeddingConfig
}

/** 瀹夎鍖呴瑁呯殑涓嫳鏂?embedding 妯″瀷锛團IX-012锛?*/
export const BUNDLED_EMBEDDING_MODEL_IDS = ['bge-small-zh', 'bge-small-en'] as const satisfies readonly LocalModelId[]

export function isBundledEmbeddingModel(id: LocalModelId): boolean {
  return (BUNDLED_EMBEDDING_MODEL_IDS as readonly LocalModelId[]).includes(id)
}

/** 鎵€鏈夋ā鍨嬬殑闈欐€佹竻鍗?*/
export const MODEL_MANIFESTS: ModelManifest[] = [
  {
    id: 'bge-small-zh',
    dimension: 512,
    compressedSizeMb: 35,
    extractedSizeMb: 90,
    source: 'bundled',
    downloadUrl: 'https://github.com/nicepkg/Ackem-models/releases/download/v1.0/bge-small-zh-v1.5.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/Ackem-models/releases/download/v1.0/bge-small-zh-v1.5.onnx.zip',
    qualityLabel: '涓枃鏁堟灉 鈽呪槄鈽呪槄',
    speedLabel: '< 10ms',
    memoryLabel: '~150MB'
  },
  {
    id: 'bge-small-en',
    dimension: 512,
    compressedSizeMb: 40,
    extractedSizeMb: 130,
    source: 'bundled',
    downloadUrl: 'https://github.com/nicepkg/Ackem-models/releases/download/v1.0/bge-small-en-v1.5.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/Ackem-models/releases/download/v1.0/bge-small-en-v1.5.onnx.zip',
    qualityLabel: 'English 鈽呪槄鈽呪槄',
    speedLabel: '< 10ms',
    memoryLabel: '~150MB'
  },
  {
    id: 'm3e-small',
    dimension: 512,
    compressedSizeMb: 35,
    extractedSizeMb: 90,
    source: 'downloadable',
    downloadUrl: 'https://github.com/nicepkg/Ackem-models/releases/download/v1.0/m3e-small.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/Ackem-models/releases/download/v1.0/m3e-small.onnx.zip',
    qualityLabel: '涓枃鏁堟灉 鈽呪槄鈽呪槄',
    speedLabel: '< 10ms',
    memoryLabel: '~150MB'
  },
  {
    id: 'bge-base-zh',
    dimension: 768,
    compressedSizeMb: 150,
    extractedSizeMb: 400,
    source: 'downloadable',
    downloadUrl: 'https://github.com/nicepkg/Ackem-models/releases/download/v1.0/bge-base-zh-v1.5.onnx.zip',
    mirrorUrl: 'https://gitee.com/nicepkg/Ackem-models/releases/download/v1.0/bge-base-zh-v1.5.onnx.zip',
    qualityLabel: '涓枃鏁堟灉 鈽呪槄鈽呪槄鈽咃紙鏈€濂斤級',
    speedLabel: '20-30ms',
    memoryLabel: '~500MB'
  }
]

export function getModelManifest(id: LocalModelId): ModelManifest | undefined {
  return MODEL_MANIFESTS.find(m => m.id === id)
}
