import type { MemoryFact, Episode } from '../../engine/types'
import type { FactStore } from '../factStore'
import type { EpisodicStore } from '../episodicStore'
import { getDatabase } from '../../db/database'
import { DOMAINS } from '../taxonomy'
import { IMPORT_SESSION_ID } from '../../../shared/documentImport'
import type { MemoryAuditMode, MemoryAuditReport } from '../../../shared/memoryAudit'
import {
  CURATED_AUDIT_MAX_EPISODES,
  CURATED_AUDIT_MAX_FACTS,
  CURATED_AUDIT_MIN_CONFIDENCE,
  CURATED_AUDIT_MIN_WEIGHT,
  CURATED_AUDIT_EPISODE_MIN_INTENSITY,
  FULL_DUMP_PAGE_SIZE,
} from './constants'
import { DOMAIN_ZH, SUBCAT_ZH, TIMELINE_TYPE_ZH } from './labels'

function factSource(f: MemoryFact): '对话' | '导入' | '其他' {
  const sid = f.sourceSessionId?.trim()
  if (!sid) return '其他'
  if (sid === IMPORT_SESSION_ID) return '导入'
  return '对话'
}

function toFactRow(f: MemoryFact): MemoryAuditReport['facts'][number] {
  return {
    id: f.id,
    domain: f.domain,
    subcategory: f.subcategory,
    domainLabel: DOMAIN_ZH[f.domain] ?? f.domain,
    subcategoryLabel: SUBCAT_ZH[f.subcategory] ?? f.subcategory,
    subject: f.subject,
    summary: f.summary,
    weight: f.weight,
    confidence: f.confidence,
    isCore: f.tier === 'core',
    source: factSource(f),
  }
}

function scoreFact(f: MemoryFact): number {
  return f.weight * f.confidence + (f.tier === 'core' ? 2 : 0)
}

function selectCuratedFacts(all: MemoryFact[], includeAvoid: boolean): MemoryFact[] {
  const pool = all.filter((f) => includeAvoid || f.sensitivity !== 'avoid')
  const picked = new Map<string, MemoryFact>()

  for (const f of pool.filter((x) => x.tier === 'core')) {
    picked.set(f.id, f)
  }

  const ranked = pool
    .filter((f) => !picked.has(f.id))
    .filter((f) => f.weight >= CURATED_AUDIT_MIN_WEIGHT && f.confidence >= CURATED_AUDIT_MIN_CONFIDENCE)
    .sort((a, b) => scoreFact(b) - scoreFact(a))

  for (const f of ranked) {
    if (picked.size >= CURATED_AUDIT_MAX_FACTS) break
    picked.set(f.id, f)
  }

  for (const domain of DOMAINS) {
    if (picked.size >= CURATED_AUDIT_MAX_FACTS) break
    if ([...picked.values()].some((f) => f.domain === domain)) continue
    const best = pool
      .filter((f) => f.domain === domain && !picked.has(f.id))
      .sort((a, b) => scoreFact(b) - scoreFact(a))[0]
    if (best) picked.set(best.id, best)
  }

  return [...picked.values()].sort((a, b) => scoreFact(b) - scoreFact(a))
}

function selectFullDumpFacts(all: MemoryFact[], includeAvoid: boolean, page: number): MemoryFact[] {
  const pool = all
    .filter((f) => includeAvoid || f.sensitivity !== 'avoid')
    .sort((a, b) => scoreFact(b) - scoreFact(a))
  const start = (page - 1) * FULL_DUMP_PAGE_SIZE
  return pool.slice(start, start + FULL_DUMP_PAGE_SIZE)
}

function loadTimeline(dataRoot: string, facts: MemoryFact[]) {
  const rows: MemoryAuditReport['timeline'] = []
  const seen = new Set<string>()

  const push = (row: MemoryAuditReport['timeline'][number]) => {
    const key = `${row.dateLabel}|${row.summary}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push(row)
  }

  for (const f of facts) {
    if (f.ageMeta?.birthdayMMDD) {
      const y = f.ageMeta.birthYear ? String(f.ageMeta.birthYear) : ''
      push({
        dateLabel: y ? `${y}-${f.ageMeta.birthdayMMDD}` : f.ageMeta.birthdayMMDD,
        type: 'birthday',
        typeLabel: TIMELINE_TYPE_ZH.birthday,
        summary: `${f.subject}：${f.summary}`.slice(0, 120),
      })
    }
  }

  const db = getDatabase(dataRoot)
  if (db) {
    try {
      const anchors = db
        .prepare(
          `SELECT anchor_date, anchor_type, summary FROM temporal_anchors ORDER BY anchor_date ASC LIMIT 24`
        )
        .all() as Array<{ anchor_date: string; anchor_type: string; summary: string }>
      for (const a of anchors) {
        const type =
          a.anchor_type === 'recurring'
            ? a.summary.includes('生日')
              ? 'birthday'
              : 'anniversary'
            : 'milestone'
        push({
          dateLabel: a.anchor_date.slice(0, 10),
          type: type as MemoryAuditReport['timeline'][number]['type'],
          typeLabel: TIMELINE_TYPE_ZH[type] ?? TIMELINE_TYPE_ZH.custom,
          summary: a.summary.slice(0, 120),
        })
      }
    } catch {
      /* table may be missing */
    }
  }

  for (const f of facts) {
    if (!/20\d{2}|19\d{2}|计划|毕业|分手|去世|生日|纪念日/u.test(f.summary)) continue
    if (f.subcategory !== 'PLANS' && f.subcategory !== 'LIFE_STORY' && f.subcategory !== 'COMMITMENTS') continue
    push({
      dateLabel: '—',
      type: f.subcategory === 'PLANS' ? 'plan' : 'milestone',
      typeLabel: f.subcategory === 'PLANS' ? TIMELINE_TYPE_ZH.plan : TIMELINE_TYPE_ZH.milestone,
      summary: `${f.subject}：${f.summary}`.slice(0, 120),
    })
    if (rows.length >= 12) break
  }

  return rows.slice(0, 12)
}

function selectEpisodes(epStore: EpisodicStore | undefined, mode: MemoryAuditMode): MemoryAuditReport['episodes'] {
  if (!epStore || mode === 'stats_only') return []
  epStore.load()
  const all = epStore.listAll()
  const ranked =
    mode === 'curated_audit' || mode === 'self_report'
      ? all
          .filter((e) => e.emotionalIntensity >= CURATED_AUDIT_EPISODE_MIN_INTENSITY)
          .sort((a, b) => b.emotionalIntensity - a.emotionalIntensity)
          .slice(0, CURATED_AUDIT_MAX_EPISODES)
      : all.sort((a, b) => b.emotionalIntensity - a.emotionalIntensity).slice(0, CURATED_AUDIT_MAX_EPISODES)

  return ranked.map((e) => ({
    id: e.id,
    summary: e.summary,
    dominantEmotion: e.dominantEmotion,
    emotionalIntensity: e.emotionalIntensity,
    createdAt: e.createdAt,
  }))
}

function buildDomainStats(all: MemoryFact[], listed: MemoryFact[]): MemoryAuditReport['domainStats'] {
  const listedIds = new Set(listed.map((f) => f.id))
  return DOMAINS.map((domain) => {
    const total = all.filter((f) => f.domain === domain).length
    const listedCount = all.filter((f) => f.domain === domain && listedIds.has(f.id)).length
    return {
      domain,
      label: DOMAIN_ZH[domain] ?? domain,
      total,
      listed: listedCount,
    }
  }).filter((d) => d.total > 0)
}

export function buildMemoryAuditReport(args: {
  dataRoot: string
  factStore: FactStore
  episodicStore?: EpisodicStore
  mode: MemoryAuditMode
  includeAvoid?: boolean
  page?: number
}): MemoryAuditReport {
  args.factStore.load()
  const allActive = args.factStore.listActive()
  const includeAvoid = args.includeAvoid ?? false
  const hiddenCount = allActive.filter((f) => f.sensitivity === 'avoid').length
  const page = args.page ?? 1

  let selected: MemoryFact[] = []
  if (args.mode === 'stats_only') {
    selected = []
  } else if (args.mode === 'full_dump') {
    selected = selectFullDumpFacts(allActive, includeAvoid, page)
  } else {
    selected = selectCuratedFacts(allActive, includeAvoid)
  }

  const pageCount =
    args.mode === 'full_dump'
      ? Math.max(
          1,
          Math.ceil(
            allActive.filter((f) => includeAvoid || f.sensitivity !== 'avoid').length / FULL_DUMP_PAGE_SIZE
          )
        )
      : undefined

  const timeline =
    args.mode === 'stats_only' ? [] : loadTimeline(args.dataRoot, selected.length ? selected : allActive.slice(0, 30))

  const episodes = selectEpisodes(args.episodicStore, args.mode)

  return {
    mode: args.mode,
    generatedAt: new Date().toISOString(),
    stats: {
      totalActiveFacts: allActive.length,
      factsListed: selected.length,
      factsHidden: includeAvoid ? 0 : hiddenCount,
      coreFacts: args.factStore.getCoreFacts().length,
      episodesListed: episodes.length,
      timelineCount: timeline.length,
      page: args.mode === 'full_dump' ? page : undefined,
      pageCount,
    },
    facts: selected.map(toFactRow),
    timeline,
    episodes,
    domainStats: buildDomainStats(allActive, selected),
  }
}
