/** Investigation 模式 — 主进程与渲染进程共享类型（V1.5 Parity） */

export type InvestigationIntentId =
  | 'filesystem_inventory'
  | 'filesystem_search'
  | 'filesystem_organize'

export type InvestigationTemplateId = 'games' | 'documents' | 'generic_dir'

export type InvestigationIntent = {
  intentId: InvestigationIntentId
  templateId: InvestigationTemplateId
  userQuery: string
}

export type GameFindingSource =
  | 'shortcut'
  | 'start_menu'
  | 'program_files'
  | 'program_files_x86'
  | 'local_programs'
  | 'steam_common'
  | 'epic_manifest'
  | 'heuristic'

export type GameFindingConfidence = 'high' | 'medium' | 'low'

export type GameFinding = {
  displayName: string
  path: string
  source: GameFindingSource
  confidence: GameFindingConfidence
  dedupeKey: string
}

export type NotScannedEntry = {
  checklistId: string
  reason: string
  path: string | null
}

export type GamesFindingsReport = {
  schemaVersion: 1
  template: 'games'
  games: GameFinding[]
  scannedRoots: string[]
  notScanned: NotScannedEntry[]
  stats: {
    total: number
    bySource: Partial<Record<GameFindingSource, number>>
  }
}

export type FileFinding = {
  displayName: string
  path: string
  source: 'desktop' | 'documents' | 'downloads' | 'user_root'
  confidence: GameFindingConfidence
}

export type DocumentsFindingsReport = {
  schemaVersion: 1
  template: 'documents'
  files: FileFinding[]
  extensions: string[]
  scannedRoots: string[]
  notScanned: NotScannedEntry[]
  stats: { total: number }
}

export type InvestigationReport = GamesFindingsReport | DocumentsFindingsReport

export type InvestigationProgressPayload = {
  done: number
  total: number
  label: string
  currentStepId?: string
}

export type ChecklistStepStatus = 'pending' | 'running' | 'done' | 'skipped'

export type ChecklistStep = {
  id: string
  label: string
  status: ChecklistStepStatus
  hits: number
}

export const INVESTIGATION_SYNTHESIZE_MIN_TOKENS = 8192

export function synthesizeMaxTokens(findingsCount: number): number {
  return Math.max(INVESTIGATION_SYNTHESIZE_MIN_TOKENS, 512 + findingsCount * 80)
}
