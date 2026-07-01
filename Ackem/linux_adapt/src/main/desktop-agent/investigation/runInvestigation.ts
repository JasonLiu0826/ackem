import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { WebContents } from 'electron'
import type {
  DocumentsFindingsReport,
  FileFinding,
  GameFinding,
  GamesFindingsReport,
  InvestigationIntent,
  InvestigationReport,
  NotScannedEntry
} from '../../../shared/investigation'
import { createGamesChecklist, createDocumentsChecklist } from './checklistTemplates'
import { attachReportMeta, makeGameFinding, mergeGameFindings } from './findingsMerge'
import { emitInvestigationProgress } from './investigationProgress'
import { yieldToEventLoop } from './yieldEventLoop'
import { scanShortcutsInDir, scanStartMenuShortcuts } from '../parsers/win/shortcuts'
import { parseSteamLibraries } from '../parsers/win/steamLibraries'
import { parseEpicManifests } from '../parsers/win/epicManifests'
import {
  mergeFileFindings,
  parseExtensionsFromQuery,
  searchFilesByExtensions
} from './documentSearch'
import { createLogger } from '../../logger'
import {
  buildGamesReportFromMap,
  maybeRefreshMachineMap,
  upsertLiveGamesToMap
} from '../machine-map/service'
import { classifyAsGame, type GameSourceKind } from '../machine-map/gameClassifier'

const log = createLogger('investigation')

const GAME_DIR_HEURISTIC =
  /game|riot|blizzard|ubisoft|ea\b|bethesda|fromsoftware|capcom|square|bandai|mihoyo|hoyoverse|tencent|netease|perfect world|wargaming|supercell|valve|cd projekt|rockstar|2k games|activision|xbox|bethesda|arkane|id software/i

function programFilesRoots(): { pf: string; pfx86: string; localPrograms: string; desktop: string } {
  const home = homedir()
  return {
    pf: process.env.ProgramFiles ?? join('C:', 'Program Files'),
    pfx86: process.env['ProgramFiles(x86)'] ?? join('C:', 'Program Files (x86)'),
    localPrograms: process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Programs')
      : join(home, 'AppData', 'Local', 'Programs'),
    desktop: join(home, 'Desktop')
  }
}

function listGameLikeFolders(root: string, source: 'program_files' | 'program_files_x86' | 'local_programs'): GameFinding[] {
  if (!existsSync(root)) return []
  const out: GameFinding[] = []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (!GAME_DIR_HEURISTIC.test(e.name)) continue
    const f = makeGameFinding(e.name, join(root, e.name), source, 'medium')
    if (!f) continue
    if (!classifyAsGame(e.name, join(root, e.name), source as GameSourceKind).ok) continue
    out.push(f)
  }
  return out
}

function shortcutsToFindings(
  shortcuts: Array<{ name: string; path: string; target: string }>,
  source: GameFinding['source']
): GameFinding[] {
  const out: GameFinding[] = []
  for (const s of shortcuts) {
    const name = s.name.trim()
    const path = s.target || s.path
    if (!classifyAsGame(name, path, source as GameSourceKind).ok) continue
    const f = makeGameFinding(name, path, source, 'high')
    if (f) out.push(f)
  }
  return out
}

export type RunInvestigationOptions = {
  webContents?: WebContents
  dataRoot?: string
}

export async function runGamesInvestigation(
  intent: InvestigationIntent,
  opts: RunInvestigationOptions = {}
): Promise<GamesFindingsReport> {
  if (opts.dataRoot) {
    const fromMap = buildGamesReportFromMap(opts.dataRoot)
    if (fromMap && fromMap.stats.total > 0) {
      log.info('investigation.from_map', { total: fromMap.stats.total })
      return fromMap
    }
    maybeRefreshMachineMap(opts.dataRoot, 'investigation_miss')
  }

  const steps = createGamesChecklist()
  const raw: GameFinding[] = []
  const scannedRoots: string[] = []
  const notScanned: NotScannedEntry[] = []
  const roots = programFilesRoots()

  const emit = (stepIdx: number) => {
    emitInvestigationProgress(opts.webContents, steps, steps[stepIdx]?.id)
    log.info('investigation.progress', {
      step: steps[stepIdx]?.id,
      label: steps[stepIdx]?.label
    })
  }

  const runStep = async (
    idx: number,
    fn: () => GameFinding[] | Promise<GameFinding[]>,
    rootForScan?: string
  ): Promise<void> => {
    await yieldToEventLoop()
    steps[idx].status = 'running'
    emit(idx)
    try {
      const hits = await fn()
      steps[idx].hits = hits.length
      steps[idx].status = 'done'
      raw.push(...hits)
      if (rootForScan) scannedRoots.push(rootForScan)
    } catch (e) {
      steps[idx].status = 'skipped'
      notScanned.push({
        checklistId: steps[idx].id,
        reason: e instanceof Error ? e.message : String(e),
        path: rootForScan ?? null
      })
    }
  }

  await runStep(
    0,
    async () => shortcutsToFindings(await scanShortcutsInDir(roots.desktop, true), 'shortcut'),
    roots.desktop
  )
  await runStep(1, async () => shortcutsToFindings(await scanStartMenuShortcuts(), 'start_menu'))
  await runStep(2, () => listGameLikeFolders(roots.pf, 'program_files'), roots.pf)
  await runStep(3, () => listGameLikeFolders(roots.pfx86, 'program_files_x86'), roots.pfx86)
  await runStep(4, () => listGameLikeFolders(roots.localPrograms, 'local_programs'), roots.localPrograms)

  await runStep(5, () => {
    const steam = parseSteamLibraries()
    if (!steam.installRoot) {
      notScanned.push({
        checklistId: 'steam_libraries',
        reason: 'steam_not_installed',
        path: null
      })
      return []
    }
    scannedRoots.push(...steam.libraryRoots)
    return steam.games.map((g) => {
      const f = makeGameFinding(g.displayName, g.path, 'steam_common', 'high')
      return f!
    }).filter(Boolean)
  })

  await runStep(6, () => {
    const epic = parseEpicManifests()
    if (epic.length === 0) {
      notScanned.push({
        checklistId: 'epic_games',
        reason: 'epic_not_found_or_empty',
        path: null
      })
      return []
    }
    return epic.map((g) => makeGameFinding(g.displayName, g.path, 'epic_manifest', 'high')!).filter(Boolean)
  })

  const merged = mergeGameFindings(raw)
  const report = attachReportMeta(merged, scannedRoots, notScanned)

  log.info('investigation.complete', {
    intent: intent.intentId,
    template: intent.templateId,
    findingsCount: report.stats.total,
    checklistDone: steps.filter((s) => s.status === 'done').length,
    toolsInvoked: 'investigation_direct',
    assistantMessagesEmitted: 0
  })

  if (opts.dataRoot) {
    upsertLiveGamesToMap(opts.dataRoot, report)
  }

  return report
}

export async function runDocumentsInvestigation(
  intent: InvestigationIntent,
  opts: RunInvestigationOptions = {}
): Promise<DocumentsFindingsReport> {
  const steps = createDocumentsChecklist()
  const extensions = parseExtensionsFromQuery(intent.userQuery)
  const home = homedir()
  const roots = {
    desktop: join(home, 'Desktop'),
    documents: join(home, 'Documents'),
    downloads: join(home, 'Downloads')
  }
  const raw: FileFinding[] = []
  const scannedRoots: string[] = []
  const notScanned: NotScannedEntry[] = []

  const emit = (stepIdx: number) => {
    emitInvestigationProgress(opts.webContents, steps, steps[stepIdx]?.id)
  }

  const runDocStep = async (
    idx: number,
    root: string,
    source: FileFinding['source']
  ): Promise<void> => {
    await yieldToEventLoop()
    steps[idx].status = 'running'
    emit(idx)
    try {
      if (!existsSync(root)) {
        steps[idx].status = 'skipped'
        notScanned.push({ checklistId: steps[idx].id, reason: 'path_not_found', path: root })
        return
      }
      const hits = searchFilesByExtensions(root, extensions, source)
      steps[idx].hits = hits.length
      steps[idx].status = 'done'
      raw.push(...hits)
      scannedRoots.push(root)
    } catch (e) {
      steps[idx].status = 'skipped'
      notScanned.push({
        checklistId: steps[idx].id,
        reason: e instanceof Error ? e.message : String(e),
        path: root
      })
    }
  }

  await runDocStep(0, roots.desktop, 'desktop')
  await runDocStep(1, roots.documents, 'documents')
  await runDocStep(2, roots.downloads, 'downloads')

  const files = mergeFileFindings(raw)
  log.info('investigation.complete', {
    intent: intent.intentId,
    template: 'documents',
    findingsCount: files.length,
    extensions
  })

  return {
    schemaVersion: 1,
    template: 'documents',
    files,
    extensions,
    scannedRoots,
    notScanned,
    stats: { total: files.length }
  }
}

export async function runInvestigation(
  intent: InvestigationIntent,
  opts: RunInvestigationOptions = {}
): Promise<InvestigationReport | null> {
  if (intent.templateId === 'games') {
    return runGamesInvestigation(intent, opts)
  }
  if (intent.templateId === 'documents' || intent.templateId === 'generic_dir') {
    return runDocumentsInvestigation(intent, opts)
  }
  return null
}
