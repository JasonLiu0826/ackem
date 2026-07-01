import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertReadableUnderDataRoot } from '../../whitelist'
import { promoteImportToMemory } from '../../fsops'
import { createLlmJsonClient } from '../../llmClient'
import type { AppSettings } from '../../settings'
import type {
  ImportAnchorDraft,
  ImportEpisodeDraft,
  ImportFactDraft,
  ImportJob,
  ImportParseResult,
} from '../../../shared/documentImport'
import { IMPORT_CONSENT_VERSION, IMPORT_SESSION_ID } from '../../../shared/documentImport'
import { FactStore, defaultFactsPath } from '../factStore'
import { chunkDocumentText } from './chunkDocument'
import { newDraftId, parseImportChunk } from './parseImportChunk'
import { isMemoryJsonImportPath, parseMemoryJsonText } from './parseMemoryJson'
import { saveImportJob } from './jobStore'
import { createLogger } from '../../logger'

const log = createLogger('document-import')

function readImportFile(dataRoot: string, rel: string, maxBytes: number): string {
  const safe = assertReadableUnderDataRoot(dataRoot, rel)
  if (!safe) return ''
  const abs = join(dataRoot, safe.replace(/\\/g, '/'))
  if (!existsSync(abs)) return ''
  try {
    return readFileSync(abs).slice(0, maxBytes).toString('utf-8')
  } catch {
    return ''
  }
}

function ensureMemoryPath(dataRoot: string, rel: string): { ok: true; memoryRel: string } | { ok: false; error: string } {
  const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized.startsWith('memory/')) {
    return { ok: true, memoryRel: normalized }
  }
  if (normalized.startsWith('imports/')) {
    const promoted = promoteImportToMemory(dataRoot, normalized)
    if (!promoted.ok) return promoted
    return { ok: true, memoryRel: promoted.to }
  }
  return { ok: false, error: 'path must be under imports/ or memory/' }
}

function previewMerge(factStore: FactStore, draft: Omit<ImportFactDraft, 'draftId' | 'enabled'>): {
  mergeWithExistingId?: string
  mergeWithSummary?: string
} {
  factStore.load()
  const similar = factStore.findSimilarFacts(draft.subcategory, draft.subject, draft.summary, 0.35)
  const existing = similar[0]
  if (!existing) return {}
  return {
    mergeWithExistingId: existing.id,
    mergeWithSummary: existing.summary,
  }
}

export async function parseDocumentsToImportJob(args: {
  dataRoot: string
  settings: AppSettings
  relPaths: string[]
  consentAck: boolean
  consentVersion: number
}): Promise<ImportParseResult> {
  if (!args.consentAck) {
    return { ok: false, error: '须先确认知情同意' }
  }
  if (args.consentVersion !== IMPORT_CONSENT_VERSION) {
    return { ok: false, error: '知情同意版本已更新，请重新确认' }
  }
  if (args.relPaths.length === 0) {
    return { ok: false, error: '未选择文件' }
  }

  const jobId = randomUUID()
  const job: ImportJob = {
    id: jobId,
    status: 'parsing',
    files: [],
    createdAt: new Date().toISOString(),
    facts: [],
    episodes: [],
    anchors: [],
    stats: {
      chunksProcessed: 0,
      factsExtracted: 0,
      factsMergedPreview: 0,
      episodesExtracted: 0,
      anchorsExtracted: 0,
    },
  }
  saveImportJob(args.dataRoot, job)

  const promoted: string[] = []
  const memoryRels: string[] = []

  try {
    for (const rel of args.relPaths) {
      const ensured = ensureMemoryPath(args.dataRoot, rel)
      if (!ensured.ok) {
        return { ok: false, error: ensured.error }
      }
      memoryRels.push(ensured.memoryRel)
      if (rel.replace(/\\/g, '/').startsWith('imports/')) {
        promoted.push(ensured.memoryRel)
      }
    }

    const llm = createLlmJsonClient(args.settings)
    const factStore = new FactStore(defaultFactsPath(args.dataRoot))
    factStore.load()
    const limit = args.settings.singleFileSoftLimitBytes ?? 120_000

    for (const memoryRel of memoryRels) {
      const text = readImportFile(args.dataRoot, memoryRel, limit)
      if (!text.trim()) continue
      job.files.push(memoryRel)

      if (isMemoryJsonImportPath(memoryRel)) {
        const parsed = parseMemoryJsonText({ text, sourceFile: memoryRel, factStore })
        if (!parsed.ok) {
          return { ok: false, error: `${memoryRel}: ${parsed.error}` }
        }
        job.stats.chunksProcessed += 1
        for (const f of parsed.facts) {
          if (f.mergeWithExistingId) job.stats.factsMergedPreview += 1
          job.facts.push(f)
        }
        job.episodes.push(...parsed.episodes)
        job.anchors.push(...parsed.anchors)
        for (const w of parsed.stats.warnings.slice(0, 8)) {
          log.warn('json import warning', { file: memoryRel, w })
        }
        continue
      }

      const chunks = chunkDocumentText(text)
      for (let ci = 0; ci < chunks.length; ci++) {
        const parsed = await parseImportChunk({
          llm,
          sourceFile: memoryRel,
          chunkIndex: ci,
          chunkTotal: chunks.length,
          text: chunks[ci]!,
        })
        job.stats.chunksProcessed += 1

        for (const f of parsed.facts) {
          const base = {
            ...f,
            sourceFile: memoryRel,
            chunkIndex: ci,
            confidence: Math.min(f.confidence ?? 0.65, 0.78),
          }
          const merge = previewMerge(factStore, base)
          if (merge.mergeWithExistingId) job.stats.factsMergedPreview += 1
          job.facts.push({
            draftId: newDraftId(),
            ...base,
            enabled: true,
            ...merge,
          })
        }

        for (const ep of parsed.episodes) {
          job.episodes.push({
            draftId: newDraftId(),
            ...ep,
            sourceFile: memoryRel,
            enabled: true,
          })
        }

        for (const an of parsed.anchors) {
          job.anchors.push({
            draftId: newDraftId(),
            ...an,
            sourceFile: memoryRel,
            enabled: true,
          })
        }
      }
    }

    job.stats.factsExtracted = job.facts.length
    job.stats.episodesExtracted = job.episodes.length
    job.stats.anchorsExtracted = job.anchors.length
    job.status = job.files.length === 0 ? 'failed' : 'ready'
    if (job.files.length === 0) {
      job.error = '所选文件为空或不可读'
    }

    saveImportJob(args.dataRoot, job)
    log.info('import job parsed', {
      jobId,
      files: job.files.length,
      facts: job.facts.length,
      episodes: job.episodes.length,
    })

    return { ok: true, job, promoted }
  } catch (e) {
    job.status = 'failed'
    job.error = e instanceof Error ? e.message : String(e)
    saveImportJob(args.dataRoot, job)
    return { ok: false, error: job.error }
  }
}

export { IMPORT_SESSION_ID }
