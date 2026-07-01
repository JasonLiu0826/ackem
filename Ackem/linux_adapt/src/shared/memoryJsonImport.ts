/** Ackem 结构化记忆 JSON 导入（主进程 / 渲染进程共享） */

export const MEMORY_JSON_BUNDLE_SCHEMA = 'ackem.memory.bundle' as const
export const MEMORY_JSON_BUNDLE_VERSION = 1 as const

/** 单条事实（导入文件内） */
export type MemoryJsonFactInput = {
  domain?: string
  subcategory?: string
  subject: string
  summary: string
  weight?: number
  confidence?: number
  selfRelevance?: number
  triggers?: string[]
  sourceQuote?: string
}

export type MemoryJsonEpisodeInput = {
  summary: string
  emotionalIntensity?: number
  dominantEmotion?: string
  keywords?: string[]
  timeRange?: string
}

export type MemoryJsonAnchorInput = {
  type?: 'birthday' | 'anniversary' | 'custom'
  label: string
  monthDay?: string
  year?: number
  summary?: string
}

/** 推荐 bundle 格式 */
export type MemoryJsonBundle = {
  schema?: typeof MEMORY_JSON_BUNDLE_SCHEMA | string
  version?: number
  exportedAt?: string
  source?: string
  facts?: MemoryJsonFactInput[]
  episodes?: MemoryJsonEpisodeInput[]
  anchors?: MemoryJsonAnchorInput[]
}

/** facts.v2.json 片段 */
export type MemoryJsonFactsFile = {
  version?: string
  facts?: Array<
    MemoryJsonFactInput & {
      id?: string
      status?: string
    }
  >
}

export type MemoryJsonParseStats = {
  jsonFilesProcessed: number
  factsAccepted: number
  factsSkipped: number
  episodesAccepted: number
  anchorsAccepted: number
  warnings: string[]
}

/** 最小可用示例（可复制到 .json 文件） */
export const MEMORY_JSON_IMPORT_EXAMPLE: MemoryJsonBundle = {
  schema: MEMORY_JSON_BUNDLE_SCHEMA,
  version: MEMORY_JSON_BUNDLE_VERSION,
  source: '手工整理',
  facts: [
    {
      subcategory: 'HEALTH',
      subject: '用户作息',
      summary: '通常凌晨一点后才睡',
      triggers: ['熬夜', '睡觉'],
    },
    {
      subcategory: 'TASTES',
      subject: '饮品偏好',
      summary: '喜欢冰美式，不加糖',
    },
  ],
  episodes: [
    {
      summary: '2024 年夏天一起去过海边',
      emotionalIntensity: 0.7,
      dominantEmotion: 'happy',
      keywords: ['旅行', '海边'],
      timeRange: '2024-08',
    },
  ],
  anchors: [
    {
      type: 'birthday',
      label: '用户生日',
      monthDay: '3-15',
      summary: '阳历生日，记得送祝福',
    },
  ],
}
