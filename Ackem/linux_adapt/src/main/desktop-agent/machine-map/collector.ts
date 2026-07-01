import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { parseSteamLibraries } from '../parsers/win/steamLibraries'
import { parseEpicManifests } from '../parsers/win/epicManifests'
import { scanShortcutsInDir, scanStartMenuShortcuts } from '../parsers/win/shortcuts'
import { searchFilesByExtensions, parseExtensionsFromQuery } from '../investigation/documentSearch'
import { classifyAsGame, type GameSourceKind } from './gameClassifier'
import type { UpsertEntryInput } from './repo'

export type CollectorStep = {
  id: string
  label: string
  run: () => Promise<UpsertEntryInput[]>
}

const GAME_DIR_HEURISTIC =
  /game|riot|blizzard|ubisoft|bethesda|fromsoftware|capcom|square|bandai|mihoyo|valve|rockstar|activision|xbox/i

function programRoots() {
  const home = homedir()
  return {
    pf: process.env.ProgramFiles ?? join('C:', 'Program Files'),
    pfx86: process.env['ProgramFiles(x86)'] ?? join('C:', 'Program Files (x86)'),
    localPrograms: process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Programs')
      : join(home, 'AppData', 'Local', 'Programs'),
    desktop: join(home, 'Desktop'),
    documents: join(home, 'Documents'),
    downloads: join(home, 'Downloads')
  }
}

function toGameEntry(
  displayName: string,
  path: string,
  source: GameSourceKind,
  scanRunId: string
): UpsertEntryInput | null {
  const c = classifyAsGame(displayName, path, source)
  if (!c.ok) return null
  const dedupeKey = `game:${source}:${displayName.toLowerCase().replace(/\s+/g, ' ').trim()}`
  return {
    category: 'game',
    displayName,
    path,
    source,
    confidence: c.confidence,
    scanRunId,
    dedupeKey
  }
}

function listGameFolders(root: string, source: GameSourceKind, scanRunId: string): UpsertEntryInput[] {
  if (!existsSync(root)) return []
  const out: UpsertEntryInput[] = []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (!GAME_DIR_HEURISTIC.test(e.name)) continue
    const ent = toGameEntry(e.name, join(root, e.name), source, scanRunId)
    if (ent) out.push(ent)
  }
  return out
}

export function buildMachineMapSteps(scanRunId: string): CollectorStep[] {
  const roots = programRoots()
  const docExts = parseExtensionsFromQuery('pdf doc docx')

  return [
    {
      id: 'steam_libraries',
      label: 'Steam 游戏库',
      run: async () => {
        const steam = parseSteamLibraries()
        return steam.games
          .map((g) => toGameEntry(g.displayName, g.path, 'steam_common', scanRunId))
          .filter((x): x is UpsertEntryInput => x != null)
      }
    },
    {
      id: 'epic_games',
      label: 'Epic 游戏',
      run: async () => {
        return parseEpicManifests()
          .map((g) => toGameEntry(g.displayName, g.path, 'epic_manifest', scanRunId))
          .filter((x): x is UpsertEntryInput => x != null)
      }
    },
    {
      id: 'start_menu',
      label: '开始菜单游戏项',
      run: async () => {
        const shortcuts = await scanStartMenuShortcuts()
        return shortcuts
          .map((s) => toGameEntry(s.name, s.target || s.path, 'start_menu', scanRunId))
          .filter((x): x is UpsertEntryInput => x != null)
      }
    },
    {
      id: 'desktop_shortcuts',
      label: '桌面游戏快捷方式',
      run: async () => {
        const shortcuts = await scanShortcutsInDir(roots.desktop, true)
        return shortcuts
          .map((s) => toGameEntry(s.name, s.target || s.path, 'shortcut', scanRunId))
          .filter((x): x is UpsertEntryInput => x != null)
      }
    },
    {
      id: 'program_files',
      label: 'Program Files',
      run: async () => listGameFolders(roots.pf, 'program_files', scanRunId)
    },
    {
      id: 'program_files_x86',
      label: 'Program Files (x86)',
      run: async () => listGameFolders(roots.pfx86, 'program_files_x86', scanRunId)
    },
    {
      id: 'local_programs',
      label: '本地 Programs',
      run: async () => listGameFolders(roots.localPrograms, 'local_programs', scanRunId)
    },
    {
      id: 'documents_desktop',
      label: '桌面文档',
      run: async () =>
        searchFilesByExtensions(roots.desktop, docExts, 'desktop').map((f) => ({
          category: 'document' as const,
          displayName: f.displayName,
          path: f.path,
          source: f.source,
          confidence: f.confidence,
          scanRunId,
          dedupeKey: `doc:${f.path.toLowerCase()}`
        }))
    },
    {
      id: 'documents_folder',
      label: '文档文件夹',
      run: async () =>
        searchFilesByExtensions(roots.documents, docExts, 'documents').map((f) => ({
          category: 'document' as const,
          displayName: f.displayName,
          path: f.path,
          source: f.source,
          confidence: f.confidence,
          scanRunId,
          dedupeKey: `doc:${f.path.toLowerCase()}`
        }))
    },
    {
      id: 'documents_downloads',
      label: '下载文件夹',
      run: async () =>
        searchFilesByExtensions(roots.downloads, docExts, 'downloads').map((f) => ({
          category: 'document' as const,
          displayName: basename(f.path),
          path: f.path,
          source: 'downloads',
          confidence: f.confidence,
          scanRunId,
          dedupeKey: `doc:${f.path.toLowerCase()}`
        }))
    }
  ]
}
