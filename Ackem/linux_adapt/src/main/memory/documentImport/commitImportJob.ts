import { randomUUID } from 'node:crypto'
import type { AppSettings } from '../../settings'
import type { ImportCommitResult, ImportJob } from '../../../shared/documentImport'
import { IMPORT_SESSION_ID } from '../../../shared/documentImport'
import { captureEmotionalContext } from '../memoryBinding'
import { FactStore, defaultFactsPath } from '../factStore'
import { updateFactInDb } from '../../db/repos/memoryFacts'
import { EpisodicStore, defaultEpisodesPath } from '../episodicStore'
import { KnowledgeGraph, defaultKgPath } from '../knowledgeGraph'
import { extractTriggers } from '../triggerExtractor'
import { extractTriples } from '../tripleExtractor'
import { vetCreatorContradictingFact } from '../../canon/canonCreatorIngestGuard'
import { shouldWriteTemporalAnchor, detectAnchorType, writeTemporalAnchor } from '../temporalAnchorPolicy'
import { finalizeNewFacts } from '../finalizeNewFacts'
import { reseedAssociationGraphForDataRoot } from '../associationColdStart'
import { refreshIndex } from '../../ipc/shared'
import { getDatabase } from '../../db/database'
import { loadImportJob, saveImportJob } from './jobStore'
import { defaultFullState, loadState, saveState } from '../../engine/state-persistence'
import { defaultPersonalitySlice } from '../../personalityPresets'
import { createLogger } from '../../logger'

const log = createLogger('document-import-commit')

function neutralEmo(dataRoot: string, settings: AppSettings) {
  const sessionId = settings.activeSessionId || 'default'
  const st =
    loadState(dataRoot, sessionId) ?? defaultFullState(defaultPersonalitySlice(settings))
  return captureEmotionalContext(st.relationship, st.emotion)
}

function writeImportAnchor(
  dataRoot: string,
  anchor: { type: string; label: string; monthDay?: string; year?: number; summary: string },
  linkedFactIds: string[]
): boolean {
  try {
    const db = getDatabase(dataRoot)
    if (!db) return false
    const now = new Date()
    let anchorDate = now.toISOString().slice(0, 10)
    if (anchor.monthDay && /^\d{1,2}-\d{1,2}$/.test(anchor.monthDay)) {
      const [m, d] = anchor.monthDay.split('-').map(Number)
      const candidate = new Date(now.getFullYear(), (m ?? 1) - 1, d ?? 1)
      anchorDate = candidate.toISOString().slice(0, 10)
    }
    const anchorType =
      anchor.type === 'birthday' || anchor.type === 'anniversary' ? 'recurring' : 'milestone'
    db.prepare(
      `INSERT OR IGNORE INTO temporal_anchors (id, anchor_date, anchor_type, linked_fact_ids, emotional_valence, emotional_intensity, domain, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      anchorDate,
      anchorType,
      JSON.stringify(linkedFactIds),
      0,
      0.5,
      'TEMPORAL',
      `${anchor.label}：${anchor.summary}`.slice(0, 200),
      now.toISOString()
    )
    return true
  } catch {
    return false
  }
}

export async function commitImportJob(args: {
  dataRoot: string
  settings: AppSettings
  jobId: string
  disabledDraftIds?: string[]
}): Promise<ImportCommitResult> {
  const job = loadImportJob(args.dataRoot, args.jobId)
  if (!job) return { ok: false, error: '导入任务不存在' }
  if (job.status === 'committed') return { ok: false, error: '该任务已提交' }
  if (job.status !== 'ready') return { ok: false, error: job.error ?? '任务未就绪' }

  const disabled = new Set(args.disabledDraftIds ?? [])
  const emo = neutralEmo(args.dataRoot, args.settings)
  const store = new FactStore(defaultFactsPath(args.dataRoot))
  store.load()
  store.preferDbWrites()
  const kg = new KnowledgeGraph(defaultKgPath(args.dataRoot))
  kg.load()
  const epStore = new EpisodicStore(defaultEpisodesPath(args.dataRoot))
  epStore.load()

  let factsWritten = 0
  let factsMerged = 0
  let episodesWritten = 0
  let anchorsWritten = 0
  const newFactIds: string[] = []
  const writtenFacts: Array<{ id: string; subcategory: string }> = []

  const userMsgStub = `外部档案导入：${job.files.join(', ')}`

  for (const draft of job.facts) {
    if (!draft.enabled || disabled.has(draft.draftId)) continue
    const vet = vetCreatorContradictingFact(draft)
    if (vet.reject) continue

    const triggers = [
      ...new Set([...(draft.triggers ?? []), ...extractTriggers(draft.subject, draft.summary)]),
    ]
    const importTrail = `import:${draft.sourceFile}|${(draft.sourceQuote ?? draft.summary).slice(0, 80)}`

    if (
      draft.subcategory === 'BASIC_PROFILE' &&
      (draft.subject === '用户姓名' || draft.subject === '用户昵称')
    ) {
      store.downgradeNameFacts(draft.subject)
    }

    const result = store.addFactDetailed({
      domain: draft.domain,
      subcategory: draft.subcategory,
      subject: draft.subject,
      summary: draft.summary,
      weight: draft.weight,
      confidence: Math.max(draft.confidence ?? 0.65, 0.72),
      selfRelevance: draft.selfRelevance,
      triggers,
      sourceSessionId: IMPORT_SESSION_ID,
      sourceTurnIndex: draft.chunkIndex,
      emotionalContext: emo,
    })

    const fact = result.fact
    fact.updateTrail = [importTrail, ...fact.updateTrail]
    updateFactInDb(args.dataRoot, fact)
    if (result.isNew) {
      factsWritten += 1
      newFactIds.push(fact.id)
    } else {
      factsMerged += 1
    }
    writtenFacts.push({ id: fact.id, subcategory: fact.subcategory })

    if (
      shouldWriteTemporalAnchor({
        isNew: result.isNew,
        weight: draft.weight ?? 1,
        intensity: emo.intensity,
        fact,
        userMsg: userMsgStub,
      })
    ) {
      writeTemporalAnchor(args.dataRoot, fact, detectAnchorType(fact, userMsgStub))
    }

    if (kg) {
      const triples = extractTriples(draft.subject, draft.summary, fact.id, {
        subcategory: draft.subcategory,
      })
      for (const t of triples) kg.add(t)
    }
  }

  let prevEp = epStore.latest()
  for (const ep of job.episodes) {
    if (!ep.enabled || disabled.has(ep.draftId)) continue
    const summary =
      ep.timeRange && !ep.summary.includes(ep.timeRange)
        ? `（${ep.timeRange}）${ep.summary}`
        : ep.summary
    const created = epStore.add({
      summary,
      emotionalIntensity: ep.emotionalIntensity,
      dominantEmotion: ep.dominantEmotion,
      keywords: ep.keywords,
      prevEpisodeId: prevEp?.id ?? null,
      sourceSessionId: IMPORT_SESSION_ID,
      startTurn: 0,
      endTurn: 0,
    })
    prevEp = created
    episodesWritten += 1
  }

  for (const an of job.anchors) {
    if (!an.enabled || disabled.has(an.draftId)) continue
    const linked = store
      .listActive()
      .filter(
        (f) =>
          f.sourceSessionId === IMPORT_SESSION_ID &&
          (f.summary.includes(an.label) ||
            f.subject.includes(an.label.replace(/^用户/, '')) ||
            (an.monthDay && f.ageMeta?.birthdayMMDD === an.monthDay))
      )
      .slice(0, 3)
      .map((f) => f.id)
    if (writeImportAnchor(args.dataRoot, an, linked)) anchorsWritten += 1
  }

  await finalizeNewFacts({
    dataRoot: args.dataRoot,
    sessionId: IMPORT_SESSION_ID,
    turnIndex: 0,
    newFactIds,
    facts: writtenFacts,
  })

  refreshIndex()
  let associationSeed = { edgesCreated: 0, factsConsidered: 0, orphansLinked: 0 }
  try {
    associationSeed = await reseedAssociationGraphForDataRoot(args.dataRoot)
  } catch {
    /* best-effort */
  }

  const committed: ImportJob = { ...job, status: 'committed' }
  saveImportJob(args.dataRoot, committed)

  store.flush()

  log.info('import job committed', {
    jobId: job.id,
    factsWritten,
    factsMerged,
    episodesWritten,
    anchorsWritten,
  })

  return {
    ok: true,
    factsWritten,
    factsMerged,
    episodesWritten,
    anchorsWritten,
    associationSeed,
  }
}
