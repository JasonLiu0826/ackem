// [memory-viz/types] — 记忆可视化类型定义

/** 记忆事实（renderer 侧精简定义，与 main/engine/types 对齐） */
export interface MemoryFact {
  id: string
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight: number
  confidence: number
  status: 'active' | 'retired'
  emotionalContext: {
    valence: number
    intensity: number
    relStage: string
    trust: number
    atmosphere: string
  }
  selfRelevance: number
  triggers: string[]
  updateTrail: string[]
  sourceSessionId: string
  sourceTurnIndex: number
  createdAt: string
  updatedAt: string
  derivedFrom?: string[]
  factLayer?: 'raw' | 'consolidated'
  tier?: 'core' | 'archival'
  sensitivity?: 'normal' | 'avoid'
}

/** 知识图谱三元组 */
export interface Triple {
  id: string
  subject: string
  predicate: string
  object: string
  confidence: number
  sourceFactIds: string[]
  createdAt: string
}

/** 情节记忆 */
export interface Episode {
  id: string
  summary: string
  emotionalIntensity: number
  dominantEmotion: string
  keywords: string[]
  prevEpisodeId: string | null
  sourceSessionId: string
  startTurn: number
  endTurn: number
  createdAt: string
}

/** 知识图谱节点（D3 力导向图用） */
export interface KgGraphNode {
  id: string
  label: string
  degree: number
  domain?: string
}

/** 知识图谱边 */
export interface KgGraphEdge {
  id: string
  source: string
  target: string
  predicate: string
  confidence: number
}

/** 关联网络节点 */
export interface AssocNode {
  id: string
  label: string
  weight: number
  tier: 'core' | 'archival'
  domain: string
  subcategory: string
  valence: number
  intensity: number
}

/** 关联网络边 */
export interface AssocEdge {
  id: string
  source: string
  target: string
  assocType: string
  strength: number
}

/** 热力图单元格 */
export interface HeatmapCell {
  date: string
  subcategory: string
  count: number
  avgValence: number
  avgIntensity: number
  facts: MemoryFact[]
}

/** 遗忘曲线数据 */
export interface DecayCurve {
  factId: string
  subject: string
  subcategory: string
  tier: 'core' | 'archival'
  status: 'active' | 'retired'
  sensitivity: 'normal' | 'avoid'
  lambda: number
  halfLife: number
  createdAt: string
  currentWeight: number
  points: Array<{ t: number; w: number }>
}

/** 记忆统计 */
export interface MemoryStats {
  totalFacts: number
  activeFacts: number
  retiredFacts: number
  coreFacts: number
  totalTriples: number
  totalAssociations: number
  totalEpisodes: number
  totalAnchors: number
  byDomain: Array<{ domain: string; c: number }>
  bySubcategory: Array<{ subcategory: string; c: number }>
}

/** 图例项 */
export interface LegendItem {
  key: string
  label: string
  color: string
  dash?: string
  count: number
}
