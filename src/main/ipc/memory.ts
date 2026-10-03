// [ipc/memory] — 记忆、情节、知识图谱、档案、镜中记忆、日记、离线思维

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { createLlmJsonClient } from '../llmClient'
import { captureEmotionalContext } from '../memory/memoryBinding'
import type { MemoryControlCommand } from '../memory/contracts'
import { createMemoryIpcHandlers } from './memoryIpcHandlers'
import { FactStore, defaultFactsPath } from '../memory/factStore'
import { MemoryConsolidator } from '../memory/consolidator'
import { EpisodicStore, defaultEpisodesPath } from '../memory/episodicStore'
import { KnowledgeGraph, defaultKgPath } from '../memory/knowledgeGraph'
import { ContradictionDetector } from '../memory/contradictionDetector'
import { VectorStore } from '../memory/vectorStore'
import { setLastConsolidationTurn } from '../engine/state-persistence'
import { appendMirrorFindings, readMirrorFindings, runMirrorCheck } from '../memory/mirrorCheckRunner'
import { exportMemoryArchive } from '../memory/archiveExporter'
import { buildMemoryAuditReport } from '../memory/memoryAudit/buildMemoryAuditReport'
import {
  memoryActionTimeline,
  memoryAuditMetrics,
  memoryWhyStored,
  previewPermanentDelete,
  verifyPermanentDeleteTarget
} from '../memory/audit/memoryAuditIpc.js'
import { resetUserInvocations, listUserInvocations } from '../route/userInvocations.js'
import { clearLearnedPatternCache } from '../route/learnedGate.js'
import { executePermanentDeleteWithReport } from './memoryPermanentDeleteBridge.js'
import { runLegacyEvidenceMigration } from '../memory/migration/legacyMigrationRunner.js'
import {
  formatMemoryAuditMarkdown,
  toMemoryAuditCardPayload,
} from '../memory/memoryAudit/formatMemoryAuditMarkdown'
import { workingMemory } from '../memory/workingMemory'
import { clearStructuredData, getDatabase } from '../db/database'
import { deleteFactsByOwner } from '../db/repos/memoryFacts'
import { saveChatHistoryToDb } from '../db/repos/chatHistory'
import { traceLatest } from '../engine/tracer'
import { saveState } from '../engine/state-persistence'
import {
  CONTRADICTION_MIN_WEIGHT,
  CONTRADICTION_SIMILARITY_THRESHOLD
} from '../engine/ackemParams'
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
  resolveDataRoot,
} from './shared'

function resolveOwnerAgentId(raw?: string): string {
  const t = raw?.trim()
  return t && t.length > 0 ? t : 'default'
}

function factBelongsToOwner(
  fact: { ownerAgentId?: string },
  ownerAgentId: string
): boolean {
  if (ownerAgentId === 'default') {
    return !fact.ownerAgentId || fact.ownerAgentId === 'default'
  }
  return fact.ownerAgentId === ownerAgentId
}

function archiveDirForOwner(root: string, ownerAgentId: string): string {
  if (ownerAgentId !== 'default') {
    return join(root, 'agents', ownerAgentId, 'memory', 'archive')
  }
  return join(root, 'memory', 'archive')
}

export function registerMemoryIpc(): void {
  const memoryHandlers = createMemoryIpcHandlers({
    dataRoot: currentDataRoot,
    sessionId: currentSessionId
  })

  ipcMain.handle('memory:list', (_e, opts?: { ownerAgentId?: string }) => {
    const root = currentDataRoot()
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    const store = new FactStore(defaultFactsPath(root))
    store.load()
    return store.listActive().filter((f) => factBelongsToOwner(f, ownerAgentId))
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

  ipcMain.handle('memory:retire', (_e, id: string) => memoryHandlers.memoryRetire(id))

  ipcMain.handle('memory:control', async (_e, command: MemoryControlCommand) =>
    memoryHandlers.memoryControl(command)
  )

  ipcMain.handle(
    'memory:resolveControl',
    (_e, text: string, candidateTargets: import('../memory/contracts').MemoryTarget[]) =>
      memoryHandlers.memoryResolveControl(text, candidateTargets)
  )

  ipcMain.handle(
    'memory:feedback',
    async (
      _e,
      id: string,
      action: 'thumbs_up' | 'thumbs_down' | 'edit' | 'delete',
      payload?: { summary?: string; weight?: number }
    ) => {
      const root = currentDataRoot()
      const store = new FactStore(defaultFactsPath(root))
      store.load()
      if (action === 'delete') {
        const result = await memoryHandlers.memoryFeedbackDelete(id)
        return result.ok
      }
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

  ipcMain.handle('memory:clearOwner', (_e, opts?: { ownerAgentId?: string }) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    if (ownerAgentId === 'default') {
      return { ok: false as const, error: '主体记忆请使用「清空全部」' }
    }
    try {
      deleteFactsByOwner(root, ownerAgentId)
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
    const archiveDir = archiveDirForOwner(root, ownerAgentId)
    try {
      if (existsSync(archiveDir)) {
        rmSync(archiveDir, { recursive: true, force: true })
      }
    } catch {
      /* skip */
    }
    const sid = `social_${ownerAgentId}`
    try {
      const chatJson = join(root, 'companion', `chat-history-${sid}.json`)
      if (existsSync(chatJson)) rmSync(chatJson)
      saveChatHistoryToDb(root, sid, [])
    } catch {
      /* skip */
    }
    try {
      const db = getDatabase(root)
      if (db) {
        db.prepare(`DELETE FROM episodes WHERE source_session_id = ?`).run(sid)
        db.prepare(
          `DELETE FROM memory_associations WHERE fact_id_a NOT IN (SELECT id FROM memory_facts)
             OR fact_id_b NOT IN (SELECT id FROM memory_facts)`
        ).run()
      }
    } catch {
      /* skip */
    }
    workingMemory.clear(sid)
    invalidateIndexCache(root)
    getOrRebuildIndex()
    return { ok: true as const }
  })

  ipcMain.handle('route:userInvocations:list', (_e, opts?: { extensionId?: string }) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    const db = getDatabase(root)
    if (!db) return []
    return listUserInvocations(db, opts?.extensionId)
  })

  ipcMain.handle('route:habitsReset', () => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    const db = getDatabase(root)
    if (!db) return { ok: false, cleared: 0 }
    const cleared = resetUserInvocations(db)
    clearLearnedPatternCache()
    return { ok: true, cleared }
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

  ipcMain.handle('episode:list', (_e, opts?: { ownerAgentId?: string }) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    const store = new EpisodicStore(defaultEpisodesPath(root))
    store.load()
    const all = store.listAll()
    if (ownerAgentId === 'default') {
      // 主体：默认 session，或未带 social_ 前缀的历史情节
      return all.filter(
        (ep) => !ep.sourceSessionId.startsWith('social_') || ep.sourceSessionId === 'default'
      )
    }
    const sid = `social_${ownerAgentId}`
    return all.filter((ep) => ep.sourceSessionId === sid)
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

  ipcMain.handle('kg:list', (_e, opts?: { ownerAgentId?: string }) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    const kg = new KnowledgeGraph(defaultKgPath(root))
    kg.load()
    const triples = kg.listAll()
    if (!opts?.ownerAgentId) return triples
    const store = new FactStore(defaultFactsPath(root))
    store.load()
    const factIds = new Set(
      store.listActive().filter((f) => factBelongsToOwner(f, ownerAgentId)).map((f) => f.id)
    )
    return triples.filter(
      (t) =>
        Array.isArray(t.sourceFactIds) &&
        t.sourceFactIds.some((id: string) => factIds.has(id))
    )
  })

  ipcMain.handle('kg:clear', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const kg = new KnowledgeGraph(defaultKgPath(root))
    kg.load()
    kg.clear()
    return { ok: true }
  })

  ipcMain.handle('memory:exportArchive', (_e, opts?: { ownerAgentId?: string }) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    const store = new FactStore(defaultFactsPath(root))
    const epStore =
      ownerAgentId === 'default' ? new EpisodicStore(defaultEpisodesPath(root)) : undefined
    return exportMemoryArchive(root, store, epStore, { ownerAgentId })
  })

  ipcMain.handle('archive:list', (_e, opts?: { ownerAgentId?: string }) => {
    const root = currentDataRoot()
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    const archiveDir = archiveDirForOwner(root, ownerAgentId)
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

  ipcMain.handle(
    'archive:read',
    (_e, relPath: string, opts?: { ownerAgentId?: string }) => {
    const root = currentDataRoot()
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    const full = join(archiveDirForOwner(root, ownerAgentId), relPath)
    if (!existsSync(full)) return { ok: false, error: '文件不存在' }
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
    if (!existsSync(file)) return { ok: false, error: '日记不存在' }
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
    // 从记忆库找最相关的近期事实，用于个性化离线思绪
    let relatedFact: import('../memory/semantic/types.js').MemoryFact | undefined
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
    } catch { /* 降级 */ }
    const thoughts = generateOfflineThoughts(traces, state.relationship, state.emotion, relatedFact)
    state.offlineThoughts = thoughts
    saveState(root, state, currentSessionId())
    return { thoughts }
  })

  // ── 记忆可视化 API ──

  ipcMain.handle('association:list', (_e, opts?: { ownerAgentId?: string }) => {
    const root = currentDataRoot()
    const db = getDatabase(root)
    if (!db) return []
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    if (!opts?.ownerAgentId) {
      return db
        .prepare('SELECT * FROM memory_associations WHERE strength > 0.05 ORDER BY strength DESC')
        .all()
    }
    return db
      .prepare(
        `SELECT a.* FROM memory_associations a
         WHERE a.strength > 0.05
           AND a.fact_id_a IN (SELECT id FROM memory_facts WHERE owner_agent_id = ?)
           AND a.fact_id_b IN (SELECT id FROM memory_facts WHERE owner_agent_id = ?)
         ORDER BY a.strength DESC`
      )
      .all(ownerAgentId, ownerAgentId)
  })

  ipcMain.handle('anchor:list', () => {
    const root = currentDataRoot()
    const db = getDatabase(root)
    if (!db) return []
    return db.prepare('SELECT * FROM temporal_anchors ORDER BY anchor_date DESC').all()
  })

  ipcMain.handle('memory:stats', (_e, opts?: { ownerAgentId?: string }) => {
    const root = currentDataRoot()
    const db = getDatabase(root)
    if (!db) return null
    const ownerAgentId = resolveOwnerAgentId(opts?.ownerAgentId)
    const scoped = Boolean(opts?.ownerAgentId)
    const g = (sql: string, params: unknown[] = []) =>
      (db.prepare(sql).get(...params) as { c: number })?.c ?? 0
    const a = (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params)
    const ownerClause = scoped ? ' AND owner_agent_id = ?' : ''
    const ownerParams = scoped ? [ownerAgentId] : []
    return {
      totalFacts: g(`SELECT COUNT(*) as c FROM memory_facts WHERE 1=1${ownerClause}`, ownerParams),
      activeFacts: g(
        `SELECT COUNT(*) as c FROM memory_facts WHERE status='active'${ownerClause}`,
        ownerParams
      ),
      retiredFacts: g(
        `SELECT COUNT(*) as c FROM memory_facts WHERE status='retired'${ownerClause}`,
        ownerParams
      ),
      coreFacts: g(
        `SELECT COUNT(*) as c FROM memory_facts WHERE tier='core'${ownerClause}`,
        ownerParams
      ),
      totalTriples: (() => {
        if (!scoped) return g('SELECT COUNT(*) as c FROM knowledge_triples')
        const store = new FactStore(defaultFactsPath(root))
        store.load()
        const factIds = new Set(
          store.listActive().filter((f) => factBelongsToOwner(f, ownerAgentId)).map((f) => f.id)
        )
        const kg = new KnowledgeGraph(defaultKgPath(root))
        kg.load()
        return kg
          .listAll()
          .filter(
            (t) =>
              Array.isArray(t.sourceFactIds) &&
              t.sourceFactIds.some((id: string) => factIds.has(id))
          ).length
      })(),
      totalAssociations: scoped
        ? g(
            `SELECT COUNT(*) as c FROM memory_associations a
             WHERE a.strength > 0.05
               AND a.fact_id_a IN (SELECT id FROM memory_facts WHERE owner_agent_id = ?)
               AND a.fact_id_b IN (SELECT id FROM memory_facts WHERE owner_agent_id = ?)`,
            [ownerAgentId, ownerAgentId]
          )
        : g('SELECT COUNT(*) as c FROM memory_associations WHERE strength > 0.05'),
      totalEpisodes: scoped
        ? ownerAgentId === 'default'
          ? g(
              `SELECT COUNT(*) as c FROM episodes
               WHERE source_session_id = 'default'
                  OR source_session_id NOT LIKE 'social_%'`
            )
          : g(`SELECT COUNT(*) as c FROM episodes WHERE source_session_id = ?`, [
              `social_${ownerAgentId}`
            ])
        : g('SELECT COUNT(*) as c FROM episodes'),
      totalAnchors: g('SELECT COUNT(*) as c FROM temporal_anchors'),
      byDomain: a(
        `SELECT domain, COUNT(*) as c FROM memory_facts WHERE status='active'${ownerClause} GROUP BY domain`,
        ownerParams
      ),
      bySubcategory: a(
        `SELECT subcategory, COUNT(*) as c FROM memory_facts WHERE status='active'${ownerClause} GROUP BY subcategory`,
        ownerParams
      )
    }
  })

  ipcMain.handle('memory:whyStored', (_e, factId: string) => memoryWhyStored(currentDataRoot(), factId))

  ipcMain.handle('memory:actionTimeline', (_e, sessionId: string, limit?: number) =>
    memoryActionTimeline(currentDataRoot(), sessionId ?? currentSessionId(), limit)
  )

  ipcMain.handle('memory:auditMetrics', () => memoryAuditMetrics(currentDataRoot()))

  ipcMain.handle(
    'memory:permanentDeletePreview',
    (_e, preview: Parameters<typeof previewPermanentDelete>[1]) =>
      verifyPermanentDeleteTarget(currentDataRoot(), preview)
  )

  ipcMain.handle(
    'memory:permanentDelete',
    async (
      _e,
      preview: Parameters<typeof previewPermanentDelete>[1],
      turnId: string | null | undefined,
      confirmed?: boolean
    ) =>
      executePermanentDeleteWithReport(currentDataRoot(), currentSessionId(), preview, turnId, {
        confirmed: confirmed === true
      })
  )

  ipcMain.handle(
    'memory:legacyBackfill',
    (_e, opts?: { apply?: boolean; batchSize?: number; maxRounds?: number }) =>
      runLegacyEvidenceMigration(currentDataRoot(), opts ?? {})
  )

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
