/** Ackem 缁撴瀯鍖栬蹇?JSON 瀵煎叆锛堜富杩涚▼ / 娓叉煋杩涚▼鍏变韩锛?*/

export const MEMORY_JSON_BUNDLE_SCHEMA = 'Ackem.memory.bundle' as const
export const MEMORY_JSON_BUNDLE_VERSION = 1 as const

/** 鍗曟潯浜嬪疄锛堝鍏ユ枃浠跺唴锛?*/
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

/** 鎺ㄨ崘 bundle 鏍煎紡 */
export type MemoryJsonBundle = {
  schema?: typeof MEMORY_JSON_BUNDLE_SCHEMA | string
  version?: number
  exportedAt?: string
  source?: string
  facts?: MemoryJsonFactInput[]
  episodes?: MemoryJsonEpisodeInput[]
  anchors?: MemoryJsonAnchorInput[]
}

/** facts.v2.json 鐗囨 */
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

/** 鏈€灏忓彲鐢ㄧず渚嬶紙鍙鍒跺埌 .json 鏂囦欢锛?*/
export const MEMORY_JSON_IMPORT_EXAMPLE: MemoryJsonBundle = {
  schema: MEMORY_JSON_BUNDLE_SCHEMA,
  version: MEMORY_JSON_BUNDLE_VERSION,
  source: '鎵嬪伐鏁寸悊',
  facts: [
    {
      subcategory: 'HEALTH',
      subject: '鐢ㄦ埛浣滄伅',
      summary: '閫氬父鍑屾櫒涓€鐐瑰悗鎵嶇潯',
      triggers: ['鐔', '鐫¤'],
    },
    {
      subcategory: 'TASTES',
      subject: '楗搧鍋忓ソ',
      summary: '鍠滄鍐扮編寮忥紝涓嶅姞绯?,
    },
  ],
  episodes: [
    {
      summary: '2024 骞村澶╀竴璧峰幓杩囨捣杈?,
      emotionalIntensity: 0.7,
      dominantEmotion: 'happy',
      keywords: ['鏃呰', '娴疯竟'],
      timeRange: '2024-08',
    },
  ],
  anchors: [
    {
      type: 'birthday',
      label: '鐢ㄦ埛鐢熸棩',
      monthDay: '3-15',
      summary: '闃冲巻鐢熸棩锛岃寰楅€佺绂?,
    },
  ],
}
