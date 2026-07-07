// [ipc/memory] 鈥?璁板繂銆佹儏鑺傘€佺煡璇嗗浘璋便€佹。妗堛€侀暅涓蹇嗐€佹棩璁般€佺绾挎€濈淮

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { createLlmJsonClient } from '../llmClient'
import { captureEmotionalContext } from '../memory/memoryBinding'
import { FactStore, defaultFactsPath } from '../memory/factStore'
import { EpisodicStore, defaultEpisodesPath } from '../memory/episodicStore'
import { KnowledgeGraph, defaultKgPath } from '../memory/knowledgeGraph'
import { ContradictionDetector } from '../memory/contradictionDetector'
import { VectorStore } from '../memory/vectorStore'
import { setLastConsolidationTurn } from '../engine/state-persistence'
import { appendMirrorFindings, readMirrorFindings, runMirrorCheck } from '../memory/mirrorCheckRunner'
import { exportMemoryArchive } from '../memory/archiveExporter'
import { buildMemoryAuditReport } from '../memory/memoryAudit/buildMemoryAuditReport'
import {
  formatMemoryAuditMarkdown,
  toMemoryAuditCardPayload,
} from '../memory/memoryAudit/formatMemoryAuditMarkdown'
import { workingMemory } from '../memory/workingMemory'
import { clearStructuredData, getDatabase } from '../db/database'
import { traceLatest } from '../engine/tracer'
import { saveState } from '../engine/state-persistence'
import {
  CONTRADICTION_MIN_WEIGHT,
  CONTRADICTION_SIMILARITY_THRESHOLD
} from '../engine/AckemParams'
import {
  clearChatHistoryFiles,
  currentDataRoot,
  currentSessionId,
  defaultFullState,
  defaultPersonalitySlice,
  ensureDataLayout,
  getOrRebuildIndex,
  invalidateIndexCache,
  loadSettings,
  mergeEngineState,
  resolveDataRoot
} from './shared'

export function registerMemoryIpc(): void {
  ipcMain.handle('memory:list', () => {
    const root = currentDataRoot()
    const store = new FactStore(defaultFactsPath(root))
    store.load()
    return store.listActive()
  })

  ipcMain.handle(
    'memory:update',
    (_e, id: string, patch: { summary?: string; weight?: number; confidence?: number; triggers?: string[] }) => {
      const root = currentDataRoot()
      const store = new FactStore(defaultFactsPath(root))
      store.load()
      return store.updateFact(id, patch)
    }
  )

  ipcMain.handle('memory:retire', (_e, id: string) => {
    const root = currentDataRoot()
    const store = new FactStore(defaultFactsPath(root))
    store.load()
    return store.retireFact(id)
  })

  ipcMain.handle(
    'memory:feedback',
    (
      _e,
      id: string,
      action: 'thumbs_up' | 'thumbs_down' | 'edit' | 'delete',
      payload?: { summary?: string; weight?: number }
    ) => {
      const root = currentDataRoot()
      const store = new FactStore(defaultFactsPath(root))
      store.load()
      if (action === 'delete') return store.retireFact(id)
      if (action === 'thumbs_up') {
        const fact = store.listActive().find((f) => f.id === id)
        if (fact) store.updateFact(id, { confidence: Math.min(1, fact.confidence + 0.1) })
        return true
      }
      if (action === 'thumbs_down') {
        const fact = store.listActive().find((f) => f.id === id)
        if (fact) store.updateFact(id, { confidence: Math.max(0.3, fact.confidence - 0.15) })
        return true
      }
      if (action === 'edit' && payload) {
        return store.updateFact(id, payload)
      }
      return false
    }
  )

  ipcMain.handle('memory:clearAll', () => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)

    const dirsToClear = [
      join(root, 'memory', 'facts'),
      join(root, 'memory', 'tree'),
      join(root, 'memory', 'shared-events'),
      join(root, 'memory', 'episodes'),
      join(root, 'memory', 'kg'),
      join(root, 'memory', 'archive'),
      join(root, 'diary'),
      join(root, 'portrait'),
      join(root, 'preferences'),
      join(root, 'staging'),
      join(root, '_derived')
    ]
    const filesToClear = [join(root, 'memory', 'recall-history.json')]
    for (const dir of dirsToClear) {
      try {
        if (existsSync(dir)) {
          for (const entry of readdirSync(dir)) {
            rmSync(join(dir, entry), { recursive: true, force: true })
          }
        }
      } catch {
        /* skip */
      }
    }
    clearChatHistoryFiles(root)
    try {
      clearStructuredData(root)
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      }
    }
    workingMemory.clearAll()
    for (const file of filesToClear) {
      try {
        if (existsSync(file)) rmSync(file)
      } catch {
        /* skip */
      }
    }

    const pers = defaultPersonalitySlice(settings)
    saveState(root, defaultFullState(pers), currentSessionId())

    invalidateIndexCache(root)
    getOrRebuildIndex()

    return { ok: true }
  })

  ipcMain.handle('memory:consolidate', async () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const store = new FactStore(defaultFactsPath(root))
    const llm = createLlmJsonClient(s)
    const state = mergeEngineState(root, s)
    const emo = captureEmotionalContext(state.relationship, state.emotion)
    const consolidator = new MemoryConsolidator()
    const added = await consolidator.consolidate(store, llm, emo, 'manual', state.counters.totalTurns)
    setLastConsolidationTurn(root, state.counters.totalTurns, currentSessionId())
    return { added }
  })

  ipcMain.handle('episode:list', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const store = new EpisodicStore(defaultEpisodesPath(root))
    store.load()
    return store.listAll()
  })

  ipcMain.handle('episode:clear', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const store = new EpisodicStore(defaultEpisodesPath(root))
    store.clear()
    return { ok: true }
  })

  ipcMain.handle('kg:query', (_e, query: string) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const kg = new KnowledgeGraph(defaultKgPath(root))
    kg.load()
    return kg.query(query)
  })

  ipcMain.handle('kg:oneHop', (_e, entity: string) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const kg = new KnowledgeGraph(defaultKgPath(root))
    kg.load()
    return kg.oneHop(entity)
  })

  ipcMain.handle('kg:list', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const kg = new KnowledgeGraph(defaultKgPath(root))
    kg.load()
    return kg.listAll()
  })

  ipcMain.handle('kg:clear', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const kg = new KnowledgeGraph(defaultKgPath(root))
    kg.load()
    kg.clear()
    return { ok: true }
  })

  ipcMain.handle('memory:exportArchive', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const store = new FactStore(defaultFactsPath(root))
    const epStore = new EpisodicStore(defaultEpisodesPath(root))
    return exportMemoryArchive(root, store, epStore)
  })

  ipcMain.handle('archive:list', () => {
    const root = currentDataRoot()
    const archiveDir = join(root, 'memory', 'archive')
    if (!existsSync(archiveDir)) return { files: [], domains: [], lastExportAt: null }

    const walk = (
      dir: string,
      base: string
    ): Array<{ path: string; name: string; isDir: boolean; size: number }> => {
      const entries: Array<{ path: string; name: string; isDir: boolean; size: number }> = []
      if (!existsSync(dir)) return entries
      for (const name of readdirSync(dir)) {
        if (name === '_meta.json') continue
        const full = join(dir, name)
        const st = statSync(full)
        entries.push({
          path: join(base, name).replace(/\\/g, '/'),
          name,
          isDir: st.isDirectory(),
          size: st.size
        })
      }
      return entries.sort((a, b) =>
        a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)
      )
    }

    const domains = walk(archiveDir, '')
    const allFiles = domains.filter((d) => d.isDir).flatMap((d) => walk(join(archiveDir, d.name), d.name))

    let lastExportAt: string | null = null
    const metaPath = join(archiveDir, '_meta.json')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        lastExportAt = meta.lastExportAt ?? null
      } catch {
        /* ignore */
      }
    }

    return {
      files: [...domains.filter((d) => !d.isDir), ...allFiles],
      domains: domains.filter((d) => d.isDir).map((d) => d.name),
      lastExportAt
    }
  })

  ipcMain.handle('archive:read', (_e, relPath: string) => {
    const root = currentDataRoot()
    const full = join(root, 'memory', 'archive', relPath)
    if (!existsSync(full)) return { ok: false, error: '鏂囦欢涓嶅瓨鍦? }
    try {
      return { ok: true, text: readFileSync(full, 'utf-8') }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('memory:vectorSearch', (_e, query: string, topK?: number) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const store = new FactStore(defaultFactsPath(root))
    store.load()
    const vs = new VectorStore()
    vs.build(store.listActive())
    const results = vs.search(query, topK ?? 6)
    return {
      results,
      facts: vs.resolveFacts(results, store.listActive()).map((f) => ({
        id: f.id,
        subject: f.subject,
        summary: f.summary,
        subcategory: f.subcategory
      }))
    }
  })

  ipcMain.handle('memory:checkContradictions', async () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const store = new FactStore(defaultFactsPath(root))
    store.load()
    const llm = createLlmJsonClient(s)
    const detector = new ContradictionDetector()
    const active = store.listActive()
    const conflicts: Array<{ newId: string; existingId: string; judgment: string; reason: string }> = []

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (active[i].subcategory !== active[j].subcategory) continue
        if (active[i].weight < CONTRADICTION_MIN_WEIGHT || active[j].weight < CONTRADICTION_MIN_WEIGHT) continue
        const aSet = new Set([...active[i].subject, ...active[i].summary])
        const bSet = new Set([...active[j].subject, ...active[j].summary])
        let overlap = 0
        for (const ch of aSet) {
          if (bSet.has(ch)) overlap++
        }
        const sim = overlap / new Set([...aSet, ...bSet]).size
        if (sim < CONTRADICTION_SIMILARITY_THRESHOLD) continue

        const result = await detector.check(active[i], active[j], llm)
        if (result && result.judgment === 'conflict') {
          conflicts.push({
            newId: active[i].id,
            existingId: active[j].id,
            judgment: result.judgment,
            reason: result.reason
          })
        }
      }
    }
    return { conflicts }
  })

  ipcMain.handle('mirror:check', async () => {
    const root = currentDataRoot()
    const store = new FactStore(defaultFactsPath(root))
    store.load()
    const state = mergeEngineState(root, loadSettings())
    const contradictions = await runMirrorCheck(root, store)
    if (contradictions.length > 0) {
      appendMirrorFindings(root, contradictions, [], state.counters.totalTurns)
    }
    return { contradictions, findings: readMirrorFindings(root) }
  })

  ipcMain.handle('mirror:findings', () => readMirrorFindings(currentDataRoot()))

  ipcMain.handle('diary:generate', async (_e, opts?: { date?: string; force?: boolean }) => {
    const { runDailyDiaryGeneration } = await import(
      '../extensions/skills/builtin/diary-auto/dailyDiary.js'
    )
    const { localDateString } = await import('../context/localTime.js')
    const { getRuntimeContext } = await import('../extensions/runtime.js')
    const root = currentDataRoot()
    const date = opts?.date ?? localDateString()
    const settings = loadSettings()
    const state = mergeEngineState(root, settings)

    const result = await runDailyDiaryGeneration(root, settings, state, date, {
      force: opts?.force,
      trigger: 'manual',
      runtime: getRuntimeContext() ?? undefined
    })
    if (!result.ok) {
      return { ok: false, reason: result.reason }
    }
    return { ok: true, path: join(root, 'diary', `${date}.md`), writeMode: result.writeMode }
  })

  ipcMain.handle('diary:list', () => {
    const root = currentDataRoot()
    const diaryDir = join(root, 'diary')
    if (!existsSync(diaryDir)) return { entries: [], pendingSnapshots: [] }

    let meta: Record<string, { type?: string; tier?: string; gapHours?: number }> = {}
    const metaPath = join(diaryDir, 'meta.json')
    if (existsSync(metaPath)) {
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      } catch {
        /* ignore */
      }
    }

    const entries: Array<{
      date: string
      path: string
      size: number
      type: string
      tier?: string
      gapHours?: number
    }> = []
    const existingDates = new Set<string>()
    for (const name of readdirSync(diaryDir)) {
      const match = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
      if (!match) continue
      const date = match[1]
      existingDates.add(date)
      const full = join(diaryDir, name)
      try {
        const m = meta[date]
        entries.push({
          date,
          path: name,
          size: statSync(full).size,
          type: m?.type ?? 'daily',
          tier: m?.tier,
          gapHours: m?.gapHours
        })
      } catch {
        /* skip */
      }
    }
    entries.sort((a, b) => b.date.localeCompare(a.date))

    const pendingSnapshots: string[] = []
    for (const name of readdirSync(diaryDir)) {
      const m = name.match(/^\.snapshot-(\d{4}-\d{2}-\d{2})\.json$/)
      if (m && !existingDates.has(m[1])) pendingSnapshots.push(m[1])
    }
    pendingSnapshots.sort((a, b) => b.localeCompare(a))

    return { entries, pendingSnapshots }
  })

  ipcMain.handle('diary:read', (_e, date: string) => {
    const root = currentDataRoot()
    const file = join(root, 'diary', `${date}.md`)
    if (!existsSync(file)) return { ok: false, error: '鏃ヨ涓嶅瓨鍦? }
    try {
      return { ok: true, date, content: readFileSync(file, 'utf-8') }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('thought:generate', async () => {
    const { generateOfflineThoughts } = await import('../engine/offline-thought.js')
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const state = mergeEngineState(root, s)
    const traces = traceLatest(10)
    // 浠庤蹇嗗簱鎵炬渶鐩稿叧鐨勮繎鏈熶簨瀹烇紝鐢ㄤ簬涓€у寲绂荤嚎鎬濈华
    let relatedFact: import('../engine/types').MemoryFact | undefined
    try {
      const tempStore = new FactStore(defaultFactsPath(root))
      tempStore.load()
      const active = tempStore.listActive().slice(0, 20)
      if (active.length > 0) {
        let best = active[0], bestScore = 0
        for (const f of active) {
          const s = (f.weight / 3) * (f.emotionalContext?.intensity ?? 0.5) * f.selfRelevance
          if (s > bestScore) { bestScore = s; best = f }
        }
        relatedFact = best
      }
    } catch { /* 闄嶇骇 */ }
    const thoughts = generateOfflineThoughts(traces, state.relationship, state.emotion, relatedFact)
    state.offlineThoughts = thoughts
    saveState(root, state, currentSessionId())
    return { thoughts }
  })

  // 鈹€鈹€ 璁板繂鍙鍖?API 鈹€鈹€

  ipcMain.handle('association:list', () => {
    const root = currentDataRoot()
    const db = getDatabase(root)
    if (!db) return []
    return db
      .prepare('SELECT * FROM memory_associations WHERE strength > 0.05 ORDER BY strength DESC')
      .all()
  })

  ipcMain.handle('anchor:list', () => {
    const root = currentDataRoot()
    const db = getDatabase(root)
    if (!db) return []
    return db.prepare('SELECT * FROM temporal_anchors ORDER BY anchor_date DESC').all()
  })

  ipcMain.handle('memory:stats', () => {
    const root = currentDataRoot()
    const db = getDatabase(root)
    if (!db) return null
    const g = (sql: string) => (db.prepare(sql).get() as { c: number })?.c ?? 0
    const a = (sql: string) => db.prepare(sql).all()
    return {
      totalFacts: g('SELECT COUNT(*) as c FROM memory_facts'),
      activeFacts: g("SELECT COUNT(*) as c FROM memory_facts WHERE status='active'"),
      retiredFacts: g("SELECT COUNT(*) as c FROM memory_facts WHERE status='retired'"),
      coreFacts: g("SELECT COUNT(*) as c FROM memory_facts WHERE tier='core'"),
      totalTriples: g('SELECT COUNT(*) as c FROM knowledge_triples'),
      totalAssociations: g('SELECT COUNT(*) as c FROM memory_associations WHERE strength > 0.05'),
      totalEpisodes: g('SELECT COUNT(*) as c FROM episodes'),
      totalAnchors: g('SELECT COUNT(*) as c FROM temporal_anchors'),
      byDomain: a("SELECT domain, COUNT(*) as c FROM memory_facts WHERE status='active' GROUP BY domain"),
      bySubcategory: a(
        "SELECT subcategory, COUNT(*) as c FROM memory_facts WHERE status='active' GROUP BY subcategory"
      )
    }
  })

  ipcMain.handle(
    'memory:auditReport',
    (
      _e,
      opts?: {
        mode?: 'curated_audit' | 'self_report' | 'stats_only' | 'full_dump'
        includeAvoid?: boolean
        page?: number
      }
    ) => {
      const root = currentDataRoot()
      const store = new FactStore(defaultFactsPath(root))
      const epStore = new EpisodicStore(defaultEpisodesPath(root))
      const report = buildMemoryAuditReport({
        dataRoot: root,
        factStore: store,
        episodicStore: epStore,
        mode: opts?.mode ?? 'curated_audit',
        includeAvoid: opts?.includeAvoid ?? false,
        page: opts?.page,
      })
      const cardBody = formatMemoryAuditMarkdown(report)
      return {
        report,
        card: toMemoryAuditCardPayload(report, cardBody),
      }
    }
  )
}
