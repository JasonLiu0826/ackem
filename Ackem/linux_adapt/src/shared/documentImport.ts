/** 外部文档 → 结构化记忆导入（渲染进程 / 主进程共享类型） */

export const IMPORT_SESSION_ID = '__import__' as const
export const IMPORT_CONSENT_VERSION = 1 as const

export type ImportJobStatus = 'parsing' | 'ready' | 'committed' | 'failed'

export type ImportFactDraft = {
  draftId: string
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight?: number
  confidence?: number
  selfRelevance?: number
  triggers?: string[]
  sourceFile: string
  sourceQuote?: string
  chunkIndex: number
  enabled: boolean
  mergeWithExistingId?: string
  mergeWithSummary?: string
}

export type ImportEpisodeDraft = {
  draftId: string
  summary: string
  emotionalIntensity: number
  dominantEmotion: string
  keywords: string[]
  timeRange?: string
  sourceFile: string
  enabled: boolean
}

export type ImportAnchorDraft = {
  draftId: string
  type: 'birthday' | 'anniversary' | 'custom'
  label: string
  monthDay?: string
  year?: number
  summary: string
  sourceFile: string
  enabled: boolean
}

export type ImportJob = {
  id: string
  status: ImportJobStatus
  files: string[]
  createdAt: string
  facts: ImportFactDraft[]
  episodes: ImportEpisodeDraft[]
  anchors: ImportAnchorDraft[]
  stats: {
    chunksProcessed: number
    factsExtracted: number
    factsMergedPreview: number
    episodesExtracted: number
    anchorsExtracted: number
  }
  error?: string
}

export type ImportParseResult =
  | { ok: true; job: ImportJob; promoted: string[] }
  | { ok: false; error: string }

export type ImportCommitResult =
  | {
      ok: true
      factsWritten: number
      factsMerged: number
      episodesWritten: number
      anchorsWritten: number
      associationSeed?: { edgesCreated: number; factsConsidered: number; orphansLinked: number }
    }
  | { ok: false; error: string }
