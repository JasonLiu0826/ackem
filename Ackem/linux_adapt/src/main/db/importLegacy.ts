import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase } from './database'
import { loadChatHistoryFromDb, saveChatHistoryToDb } from './repos/chatHistory'
import { countFactsInDb } from './repos/memoryFacts'
import { countEpisodesInDb, loadEpisodesFromDb, replaceEpisodesInDb } from './repos/episodes'
import { countTriplesInDb, loadTriplesFromDb, replaceTriplesInDb } from './repos/knowledgeTriples'
import { countTracesInDb } from './repos/turnTraces'
import { appendTurnTraceToDb } from './repos/turnTraces'
import { saveDiaryToDb } from './repos/diary'
import {
  countOpenForuSessionsInDb,
  loadWorkspaceIndexFromDb,
  saveAgentRunToDb,
  savePlanSessionToDb,
  saveWorkspaceIndexToDb
} from './repos/openforu'
import { kvSet } from './repos/kv'
import { rebuildEpisodesFts, rebuildFactsFts } from './repos/fts'
import type { TurnTrace } from '../engine/types'
import type { Episode } from '../engine/types'
import type { Triple } from '../engine/types'
import type { OpenForUWorkspaceIndex } from '../extensions/openforu/workspaces'
import type { AgentRunMeta } from '../../shared/openforuAgentTypes'
import { normalizePlanSession, type PlanSession } from '../../shared/planSession'

function importChatHistories(dataRoot: string): void {
  const dir = join(dataRoot, 'companion')
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const m = /^chat-history-(.+)\.json$/.exec(name)
    if (!m) continue
    const sid = m[1]
    if (loadChatHistoryFromDb(dataRoot, sid).length > 0) continue
    try {
      const rows = JSON.parse(readFileSync(join(dir, name), 'utf-8')) as unknown[]
      if (Array.isArray(rows) && rows.length > 0) {
        saveChatHistoryToDb(dataRoot, sid, rows)
      }
    } catch {
      /* skip */
    }
  }
}

function importTracesFromJsonl(dataRoot: string): void {
  if (countTracesInDb(dataRoot) > 0) return
  const dir = join(dataRoot, 'traces')
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('trace-') || !name.endsWith('.jsonl')) continue
    const file = join(dir, name)
    try {
      const lines = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean)
      for (const line of lines) {
        appendTurnTraceToDb(dataRoot, JSON.parse(line) as TurnTrace)
      }
    } catch {
      /* skip file */
    }
  }
}

function importKg(dataRoot: string): void {
  if (countTriplesInDb(dataRoot) > 0) return
  const p = join(dataRoot, 'memory', 'kg', 'kg.v1.json')
  if (!existsSync(p)) return
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8')) as { triples?: unknown[] }
    if (Array.isArray(j.triples) && j.triples.length > 0) {
      replaceTriplesInDb(dataRoot, j.triples as Triple[])
    }
  } catch {
    /* skip */
  }
}

function importEpisodesIfNeeded(dataRoot: string): void {
  if (countEpisodesInDb(dataRoot) > 0) return
  const p = join(dataRoot, 'memory', 'episodes', 'episodes.v1.json')
  if (!existsSync(p)) return
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8')) as { episodes?: Episode[] }
    if (Array.isArray(j.episodes) && j.episodes.length > 0) {
      replaceEpisodesInDb(dataRoot, j.episodes)
    }
  } catch {
    /* skip */
  }
}

function importOpenForu(dataRoot: string): void {
  const indexPath = join(dataRoot, 'openforu', 'workspaces.json')
  if (existsSync(indexPath) && !loadWorkspaceIndexFromDb(dataRoot)) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8')) as OpenForUWorkspaceIndex
      saveWorkspaceIndexToDb(dataRoot, index)
    } catch {
      /* skip */
    }
  }
  if (countOpenForuSessionsInDb(dataRoot) === 0) {
    const sessionsDir = join(dataRoot, 'openforu', 'sessions')
    if (existsSync(sessionsDir)) {
      for (const name of readdirSync(sessionsDir)) {
        if (!name.endsWith('.json')) continue
        try {
          const session = normalizePlanSession(
            JSON.parse(readFileSync(join(sessionsDir, name), 'utf-8')) as PlanSession
          )
          savePlanSessionToDb(dataRoot, session)
        } catch {
          /* skip */
        }
      }
    }
  }
  const runsDir = join(dataRoot, 'openforu', 'runs')
  if (existsSync(runsDir)) {
    for (const name of readdirSync(runsDir)) {
      if (!name.endsWith('.json')) continue
      try {
        const run = JSON.parse(readFileSync(join(runsDir, name), 'utf-8')) as AgentRunMeta
        saveAgentRunToDb(dataRoot, run)
      } catch {
        /* skip */
      }
    }
  }
}

function importDiaryMirror(dataRoot: string): void {
  const dir = join(dataRoot, 'diary')
  if (!existsSync(dir)) return
  let meta: Record<string, unknown> = {}
  const metaPath = join(dir, 'meta.json')
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, unknown>
    } catch {
      meta = {}
    }
  }
  for (const name of readdirSync(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(name)
    if (!m) continue
    const date = m[1]
    try {
      const content = readFileSync(join(dir, name), 'utf-8')
      const metaJson = meta[date] ? JSON.stringify(meta[date]) : null
      saveDiaryToDb(dataRoot, date, content, metaJson)
    } catch {
      /* skip */
    }
  }
}

function importExtensionRegistries(dataRoot: string): void {
  for (const [rel, ns] of [
    ['extensions/skills/_registry.json', 'extensions.skills.registry'],
    ['extensions/plugins/_registry.json', 'extensions.plugins.registry']
  ] as const) {
    const p = join(dataRoot, rel)
    if (!existsSync(p)) continue
    try {
      const body = readFileSync(p, 'utf-8')
      kvSet(dataRoot, ns, 'entries', body)
    } catch {
      /* skip */
    }
  }
}

/** Phase 2：从既有 JSON/JSONL/MD 一次性导入 DB（幂等） */
export function importLegacyDataIfNeeded(dataRoot: string): void {
  if (!getDatabase(dataRoot)) return
  importChatHistories(dataRoot)
  importEpisodesIfNeeded(dataRoot)
  importKg(dataRoot)
  importTracesFromJsonl(dataRoot)
  importOpenForu(dataRoot)
  importDiaryMirror(dataRoot)
  importExtensionRegistries(dataRoot)
  if (countFactsInDb(dataRoot) > 0) rebuildFactsFts(dataRoot)
  if (loadEpisodesFromDb(dataRoot).length > 0) rebuildEpisodesFts(dataRoot)
}
