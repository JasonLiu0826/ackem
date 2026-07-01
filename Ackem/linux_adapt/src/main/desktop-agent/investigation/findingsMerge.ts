import type {
  GameFinding,
  GameFindingConfidence,
  GameFindingSource,
  GamesFindingsReport,
  NotScannedEntry
} from '../../../shared/investigation'

const PLATFORM_FOLDER_NAMES = new Set([
  'steam',
  'epic games',
  'epic games launcher',
  'origin',
  'ubisoft connect',
  'battle.net',
  'riot games',
  'popcap games',
  'microsoft games',
  'windowsapps'
])

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ').trim()
}

function isPlatformFolder(name: string): boolean {
  return PLATFORM_FOLDER_NAMES.has(name.toLowerCase().trim())
}

export function makeGameFinding(
  displayName: string,
  path: string,
  source: GameFindingSource,
  confidence: GameFindingConfidence
): GameFinding | null {
  const dn = displayName.trim()
  if (!dn || isPlatformFolder(dn)) return null
  const dedupeKey = `${source}:${normKey(dn)}`
  return { displayName: dn, path, source, confidence, dedupeKey }
}

export function mergeGameFindings(raw: GameFinding[]): GamesFindingsReport {
  const byName = new Map<string, GameFinding>()
  const confidenceRank: Record<GameFindingConfidence, number> = {
    high: 3,
    medium: 2,
    low: 1
  }
  const sourceRank: Partial<Record<GameFindingSource, number>> = {
    steam_common: 5,
    epic_manifest: 4,
    shortcut: 3,
    start_menu: 3,
    program_files: 2,
    program_files_x86: 2,
    local_programs: 2,
    heuristic: 1
  }

  function score(g: GameFinding): number {
    return (confidenceRank[g.confidence] ?? 0) * 10 + (sourceRank[g.source] ?? 0)
  }

  for (const item of raw) {
    if (!item.displayName || isPlatformFolder(item.displayName)) continue
    const nameKey = normKey(item.displayName)
    const prev = byName.get(nameKey)
    if (!prev || score(item) > score(prev)) {
      byName.set(nameKey, {
        ...item,
        dedupeKey: `${item.source}:${nameKey}`
      })
    }
  }

  const games = [...byName.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'zh-CN')
  )

  const bySource: GamesFindingsReport['stats']['bySource'] = {}
  for (const g of games) {
    bySource[g.source] = (bySource[g.source] ?? 0) + 1
  }

  return {
    schemaVersion: 1,
    template: 'games',
    games,
    scannedRoots: [],
    notScanned: [],
    stats: { total: games.length, bySource }
  }
}

export function attachReportMeta(
  report: GamesFindingsReport,
  scannedRoots: string[],
  notScanned: NotScannedEntry[]
): GamesFindingsReport {
  return {
    ...report,
    scannedRoots: [...new Set(scannedRoots)],
    notScanned
  }
}
