/**
 * Route v2 阶段 2-1/2-3 — mine-window marker + mining pipeline (Codex D3).
 *
 * 管线: census (missLedger) → candidate patterns (deterministic extractor,
 * LLM slot reserved) → static gate (金句集 D/R 回归 + 安全正则约束) →
 * versioned insert into Pattern Store. All inside ONE SQLite transaction:
 * append marker event (real event_id — source_event_id has an FK) + enqueue
 * the route_mine job.
 */

import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { EventRepository } from '../memory/ledger/eventRepository.js'
import { JobRepository } from '../memory/jobs/jobRepository.js'
import { censusMissLedger, type MissLedgerCensus } from '../chat/missLedger.js'
import { CURRENT_ROUTE_MINE_VERSION, JOB_TYPE_ROUTE_MINE } from './miningVersion.js'
import {
  ensureRoutePatternTables,
  insertRoutePattern,
  listActivePatterns,
  listRetiredSources
} from './patternStore.js'
import { zonedLocalDate } from '../memory/temporal/zonedDate.js'

// ---------------------------------------------------------------------------
// 金句集门禁 (红线 #2): static regression gate. A candidate pattern may never
// flip any golden sentence's channel/motive.
// ---------------------------------------------------------------------------

export type GoldenCase = { text: string; mustNotMatch: boolean }

/** D1-D15 的模式面提取: 这些句子的门0 判定不允许被学习模式改变. */
export const GOLDEN_GATE0_SENTENCES: GoldenCase[] = [
  { text: '今天好累', mustNotMatch: true },
  { text: '你会倒计时吗', mustNotMatch: true },
  { text: '整理一下 React', mustNotMatch: true },
  { text: '做一个番茄钟', mustNotMatch: false },
  { text: '把 Downloads 按日期归档', mustNotMatch: false },
  { text: '帮我看看这个 README', mustNotMatch: false }
]

export type PatternCandidate = {
  patternId: string
  layer: 'gate0_signal'
  target: string
  patternSource: string
  cardOnly: 0 | 1
  evidenceIds: string[]
}

const MAX_PATTERN_SOURCE = 120

/** 学习模式的正则必须保守: 锚定开头、无通配尾巴、长度受限 (红线: 只加宽入口). */
export function isSafeLearnedPattern(src: string): boolean {
  if (!src || src.length > MAX_PATTERN_SOURCE) return false
  if (!src.startsWith('^')) return false
  // 禁灾难回溯形状与过宽通配
  if (/\.\.[*+]/.test(src) || /\(\?[/=!</]/.test(src)) return false
  try {
    // eslint-disable-next-line no-new
    new RegExp(src)
    return true
  } catch {
    return false
  }
}

/** 静态门禁: 候选不得命中任何金句 (学习模式只能吃金句之外的新说法). */
export function passesGoldenGate(
  candidateSource: string,
  golden: GoldenCase[] = GOLDEN_GATE0_SENTENCES
): { ok: boolean; violated?: string } {
  if (!isSafeLearnedPattern(candidateSource)) return { ok: false, violated: 'unsafe_pattern' }
  let re: RegExp
  try {
    re = new RegExp(candidateSource, 'i')
  } catch {
    return { ok: false, violated: 'compile_failed' }
  }
  for (const g of golden) {
    if (re.test(g.text)) return { ok: false, violated: g.text }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Deterministic candidate extraction (离线挖矿第一步 — 无 LLM, 可复现).
// 从 S1 拒绝卡的原话提取"确认卡疲劳"模式; S3 改口对提取"欠触发"模式.
// LLM 提名保留为后续增强 (miner 接口已按 candidates 注入式设计).
// ---------------------------------------------------------------------------

export function extractCandidates(
  census: MissLedgerCensus,
  textsByTurn: Map<string, string>
): PatternCandidate[] {
  const out: PatternCandidate[] = []
  const seen = new Set<string>()

  const push = (c: Omit<PatternCandidate, 'patternId'>) => {
    if (seen.has(c.patternSource)) return
    seen.add(c.patternSource)
    out.push({ patternId: `learned_${c.target}_${out.length}_${randomUUID().slice(0, 8)}`, ...c })
  }

  // S3 改口对: 前句是 chat 判决 (漏判), 后句被接受 → 前句的动词短语长成
  // gate0_signal 候选 (目标 motive 取后句卡的 intent; 一律 cardOnly).
  for (const pair of census.rephrasePairs) {
    const text = textsByTurn.get(pair.chatTurnId)
    if (!text) continue
    const core = extractActionPhrase(text)
    if (!core) continue
    const src = `^${escapeForPattern(core)}`
    push({
      layer: 'gate0_signal',
      target: 'work',
      patternSource: src,
      cardOnly: 1,
      evidenceIds: [`chat.user_message:${pair.chatTurnId}`, `plan.accepted:${pair.acceptedTurnId}`]
    })
  }

  return out
}

/** 从漏判句提取动作短语 (动词 + 宾语前缀), 保守截取. */
function extractActionPhrase(text: string): string | null {
  const m = text.match(/(?:帮我|给我)?(处理|整理|归档|下载|安装|生成|同步|导出|导入|备份|转换|批量)[^\s，。！？]{0,12}/)
  if (!m) return null
  return m[0].slice(0, 20)
}

// ---------------------------------------------------------------------------
// 阶段 5-1: LLM 提名接口 (设计 §6.3 第 2 步的 LLM 增强).
// 确定性提取器覆盖动作短语形状; LLM 提名负责"改口对"里动词不在词表的情况。
// 提名输出仍须过 isSafeLearnedPattern + passesGoldenGate 全套门禁 —
// LLM 只是候选来源之一, 门禁才是权威。
// ---------------------------------------------------------------------------

export type LlmNominator = (args: {
  chatText: string
  acceptedText: string
}) => Promise<string | null>

const NOMINATE_SYSTEM_PROMPT = `你是路由模式提取器。给你两句用户话：
第一句是 Ackem 没听懂的（漏判），第二句是用户换了个说法后 Ackem 正确执行的（命中）。
提取第一句中让 Ackem 下次能直接识别的**动词短语**（动词+宾语，例如"处理照片""下载视频"）。
只输出一个 JSON：{"phrase":"动词短语"}。
要求：短语 2-20 个字；必须来自第一句原文；不要动词泛化；拿不准输出 {"phrase":""}。`

export function parseNominatorJson(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as { phrase?: unknown }
    if (typeof o.phrase !== 'string') return null
    const phrase = o.phrase.trim()
    if (phrase.length < 2 || phrase.length > 20) return null
    return phrase
  } catch {
    return null
  }
}

/**
 * LLM 提名: 对改口对调一次 LLM, 提取漏判句的动词短语。
 * 提名的 phrase 经与确定性提取相同的 escapeForPattern + 门禁管线。
 * 失败/超时/解析失败一律返回 [] — 挖矿永不因 LLM 而阻塞或污染。
 */
export async function nominateFromLlm(
  llm: { chatCompletionJson: (p: { messages: Array<{ role: string; content: string }>; temperature: number; max_tokens?: number }) => Promise<string> },
  census: MissLedgerCensus,
  textsByTurn: Map<string, string>,
  timeoutMs = 8000
): Promise<PatternCandidate[]> {
  const out: PatternCandidate[] = []
  const seen = new Set<string>()
  for (const pair of census.rephrasePairs.slice(0, 10)) {
    const chatText = textsByTurn.get(pair.chatTurnId)
    if (!chatText) continue
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const raw = await llm.chatCompletionJson({
        messages: [
          { role: 'system', content: NOMINATE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `第一句（漏判）：${chatText.slice(0, 120)}\n第二句（命中）：${(textsByTurn.get(pair.acceptedTurnId) ?? '').slice(0, 120)}`
          }
        ],
        temperature: 0,
        max_tokens: 100
      })
      clearTimeout(timer)
      const phrase = parseNominatorJson(raw)
      if (!phrase) continue
      const src = `^${escapeForPattern(phrase)}`
      if (seen.has(src)) continue
      seen.add(src)
      out.push({
        patternId: `learned_llm_${pair.acceptedTurnId.slice(0, 8)}_${randomUUID().slice(0, 6)}`,
        layer: 'gate0_signal',
        target: 'work',
        patternSource: src,
        cardOnly: 1,
        evidenceIds: [`chat.user_message:${pair.chatTurnId}`, `plan.accepted:${pair.acceptedTurnId}`]
      })
    } catch {
      /* LLM 提名失败静默跳过 — 确定性候选已覆盖 */
    }
  }
  return out
}

function escapeForPattern(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Marker event + job enqueue (ONE transaction, real event_id as FK target).
// ---------------------------------------------------------------------------

export type MineWindowResult = {
  ok: boolean
  markerEventId?: string
  jobId?: string
  duplicate?: boolean
  error?: string
}

export function openMineWindow(
  db: Database.Database,
  windowStart: string,
  windowEnd: string,
  now: Date,
  timezone = 'Asia/Shanghai'
): MineWindowResult {
  const events = new EventRepository(db)
  const jobs = new JobRepository(db)
  const idempotencyKey = `route.mine_window:${windowStart}:${windowEnd}:${CURRENT_ROUTE_MINE_VERSION}`
  const existing = events.findByIdempotencyKey(idempotencyKey)
  if (existing) {
    const jobId = findJobIdByMarker(db, existing.meta.eventId)
    return { ok: true, markerEventId: existing.meta.eventId, jobId, duplicate: true }
  }

  const eventId = randomUUID()
  const observedAt = now.toISOString()
  try {
    const result = db.transaction(() => {
      const inserted = events.append(
        db,
        {
          eventId,
          schemaVersion: 1,
          sessionId: 'system:route-mining',
          turnId: null,
          correlationId: eventId,
          causationEventId: null,
          nature: 'chat',
          eventType: 'route.mine_window' as never,
          surface: 'system',
          actor: 'system',
          status: null,
          evidenceKind: 'deterministic_rule',
          confidence: 1,
          observedAt,
          occurredAt: observedAt,
          scheduledFor: null,
          completedAt: null,
          timezone,
          localDate: zonedLocalDate(now, timezone),
          idempotencyKey
        },
        {
          eventId,
          summary: `route mining window ${windowStart}..${windowEnd}`,
          content: { windowStart, windowEnd, miningVersion: CURRENT_ROUTE_MINE_VERSION },
          contentHash: '',
          redactedAt: null
        }
      )
      if (inserted === 'duplicate') return { dup: true as const }

      const jobId = randomUUID()
      const enq = jobs.enqueue(db, {
        job_id: jobId,
        source_event_id: eventId,
        session_id: 'system:route-mining',
        job_type: JOB_TYPE_ROUTE_MINE,
        derivation_version: CURRENT_ROUTE_MINE_VERSION,
        status: 'pending',
        attempts: 0,
        available_at: observedAt,
        lease_until: null,
        lease_owner: null,
        lease_generation: 0,
        last_error: null,
        created_at: observedAt,
        updated_at: observedAt
      })
      if (enq === 'duplicate') return { dup: true as const }
      return { dup: false as const, jobId }
    })()
    if (result.dup) {
      const again = events.findByIdempotencyKey(idempotencyKey)
      return {
        ok: true,
        markerEventId: again?.meta.eventId,
        jobId: again ? findJobIdByMarker(db, again.meta.eventId) : undefined,
        duplicate: true
      }
    }
    return { ok: true, markerEventId: eventId, jobId: result.jobId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function findJobIdByMarker(db: Database.Database, markerEventId: string): string | undefined {
  const row = db
    .prepare(`SELECT job_id FROM memory_jobs WHERE source_event_id = ? AND job_type = ?`)
    .get(markerEventId, JOB_TYPE_ROUTE_MINE) as { job_id: string } | undefined
  return row?.job_id
}

// ---------------------------------------------------------------------------
// Mining execution (runs from the job handler): census → candidates → gate →
// pattern store. Idempotent per window via Pattern Store duplicate insert.
// ---------------------------------------------------------------------------

export type MineExecutionResult = {
  ok: boolean
  published: number
  skipped: number
  retired: string[]
  /** LLM 提名的候选数 (不含在 published 里, 已并入 candidates)。 */
  llmNominated?: number
  error?: string
}

export type LlmNominatorClient = {
  chatCompletionJson: (p: {
    messages: Array<{ role: string; content: string }>
    temperature: number
    max_tokens?: number
  }) => Promise<string>
}

export async function executeRouteMining(
  db: Database.Database,
  markerEventId: string,
  nowIso: string,
  llmNominator?: LlmNominatorClient
): Promise<MineExecutionResult> {
  try {
    ensureRoutePatternTables(db)
    const marker = new EventRepository(db).getById(markerEventId)
    if (!marker) return { ok: false, published: 0, skipped: 0, retired: [], error: 'marker missing', llmNominated: 0 }
    const content = marker.payload.content as { windowStart?: string; windowEnd?: string }
    if (!content.windowStart || !content.windowEnd) {
      return { ok: false, published: 0, skipped: 0, retired: [], error: 'marker window missing', llmNominated: 0 }
    }

    const census = censusMissLedger(db, content.windowStart, content.windowEnd)
    const textsByTurn = buildTurnTextMap(db)
    const candidates = extractCandidates(census, textsByTurn)
    let llmNominated = 0
    if (llmNominator) {
      const nominated = await nominateFromLlm(llmNominator, census, textsByTurn)
      llmNominated = nominated.length
      candidates.push(...nominated)
    }

    let published = 0
    let skipped = 0
    const activeSources = new Set(listActivePatterns(db).map((p) => p.patternSource))
    const retiredSources = listRetiredSources(db)
    for (const c of candidates) {
      // 阶段 5-4 源级禁坑: 曾退役的 source 不复活。
      if (retiredSources.has(c.patternSource)) {
        skipped += 1
        continue
      }
      if (activeSources.has(c.patternSource)) {
        skipped += 1
        continue
      }
      const gate = passesGoldenGate(c.patternSource)
      if (!gate.ok) {
        skipped += 1
        continue
      }
      const inserted = insertRoutePattern(db, {
        patternId: c.patternId,
        layer: c.layer,
        target: c.target,
        patternSource: c.patternSource,
        cardOnly: c.cardOnly,
        version: CURRENT_ROUTE_MINE_VERSION,
        status: 'active',
        evidenceIds: JSON.stringify(c.evidenceIds),
        createdAt: nowIso
      })
      if (inserted === 'inserted') published += 1
      else skipped += 1
    }
    return { ok: true, published, skipped, retired: [], llmNominated }
  } catch (e) {
    return {
      ok: false,
      published: 0,
      skipped: 0,
      retired: [],
      llmNominated: 0,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

function buildTurnTextMap(db: Database.Database): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT e.turn_id AS turn_id, p.content_json AS content_json
       FROM memory_events e
       JOIN memory_event_payloads p ON p.event_id = e.event_id
       WHERE e.event_type = 'chat.user_message' AND e.turn_id IS NOT NULL
       ORDER BY e.observed_at DESC LIMIT 2000`
    )
    .all() as Array<{ turn_id: string; content_json: string }>
  const map = new Map<string, string>()
  for (const r of rows) {
    try {
      const c = JSON.parse(r.content_json) as { userText?: string }
      if (typeof c.userText === 'string') map.set(r.turn_id, c.userText)
    } catch {
      /* skip malformed */
    }
  }
  return map
}

// keep import used (timezone helper consumed via openMineWindow signature)
void zonedLocalDate
