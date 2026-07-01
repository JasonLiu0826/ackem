import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../../../../settings'
import { createLlmJsonClient } from '../../../../llmClient'
import { PERSONALITY_PRESETS } from '../../../../personalityPresets'
import { loadTraceFile } from '../../../../engine/tracer'
import type { FullState } from '../../../../engine/types'
import { buildRuntimeContext } from '../../../../context/runtimeContext'
import type { RuntimeContext } from '../../../../context/types'
import {
  endOfLocalDayMs,
  isWithinLocalDayWindow,
  localDateFromIso,
  localDateString
} from '../../../../context/localTime'
import type { DiaryTrigger, DiaryWriteMode } from './diaryTimeTypes'
import {
  resolveDiaryTimeContext,
  shouldForceDiaryOverwrite
} from './diaryTimeContext'
import {
  formatDiaryChatExcerpts,
  formatDiaryFactLine,
  loadDiaryChatExchanges
} from './diaryChatExcerpt'
import { resolvePreferredName } from '../../../../memory/userName'
import { FactStore, defaultFactsPath } from '../../../../memory/factStore'
import { updateDynamicLayer } from '../../../../memory/userDossier'
import { generateDiary, type DiaryPersonality } from './diaryGenerate'
import {
  diaryExists,
  readDiaryMeta,
  saveDiary,
  writeDiaryMeta
} from './diaryStorage'
import { computeReunionShock, buildReunionDiaryPrompt } from '../../../../engine/reunion'
import { FactStore, defaultFactsPath } from '../../../../memory/factStore'
import { EpisodicStore, defaultEpisodesPath } from '../../../../memory/episodicStore'
import { createLogger } from '../../../../logger'
import { broadcastToRenderers } from '../../../../uiWindow'
import { getRuntimeContext } from '../../../runtime'

const log = createLogger('diary-auto')

export type DailyDiaryResult =
  | { ok: true; date: string; type: 'daily' | 'reunion'; writeMode: DiaryWriteMode; skipped?: false }
  | { ok: false; reason: string; skipped: true }

export function resolveDiaryPersonality(settings: AppSettings): DiaryPersonality {
  const preset = PERSONALITY_PRESETS.find(p => p.id === settings.personalityPresetId)
  if (!preset) {
    return { label: '默认', T: 50, I: 50, S: 50, O: 50, R: 50 }
  }
  return {
    label: preset.label,
    T: preset.T,
    I: preset.I,
    S: preset.S,
    O: preset.O,
    R: preset.R,
    tags: preset.tags
  }
}

export async function gatherDiaryMaterials(
  dataRoot: string,
  date: string,
  mode: DiaryWriteMode,
  asOf: Date,
  sessionId = 'default'
) {
  const upperBoundMs = mode === 'partial_day' ? asOf.getTime() : endOfLocalDayMs(date)

  const store = new FactStore(defaultFactsPath(dataRoot))
  store.load()
  const dayFacts = store
    .listActive()
    .filter(f => isWithinLocalDayWindow(f.createdAt, date, upperBoundMs))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 取当天所有事实，用 Embedding 重要度重排后取 top 30
  let facts: string[]
  if (store._embeddingCache && store._embeddingCache.size > 0 && dayFacts.length > 5) {
    try {
      const { cosineSimilarity } = await import('../../../../memory/factEmbeddingCache')
      const scored = dayFacts.map(f => {
        const emb = store._embeddingCache?.get(f.id)
        if (!emb) return { f, score: 0 }
        let totalSim = 0, count = 0
        for (const other of dayFacts) {
          if (other.id === f.id) continue
          const otherEmb = store._embeddingCache?.get(other.id)
          if (otherEmb) { totalSim += cosineSimilarity(emb, otherEmb); count++ }
        }
        return { f, score: count > 0 ? totalSim / count : 0 }
      })
      scored.sort((a, b) => b.score - a.score)
      facts = scored.slice(0, 30).map(s => formatDiaryFactLine(s.f.subject, s.f.summary))
    } catch {
      facts = dayFacts.slice(0, 30).map(f => formatDiaryFactLine(f.subject, f.summary))
    }
  } else {
    facts = dayFacts.slice(0, 30).map(f => formatDiaryFactLine(f.subject, f.summary))
  }

  const eStore = new EpisodicStore(defaultEpisodesPath(dataRoot))
  eStore.load()
  const episodes = eStore
    .listAll()
    .filter(ep => isWithinLocalDayWindow(ep.createdAt, date, upperBoundMs))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map(ep => ep.summary)

  const fileTraces = loadTraceFile(dataRoot, date)
  const traces = fileTraces.filter(t => {
    if (t.turn <= 0) return false
    if (!t.timestamp) return mode !== 'partial_day'
    return isWithinLocalDayWindow(t.timestamp, date, upperBoundMs)
  })

  const highlights = traces
    .map(t => `轮${t.turn} 情绪${t.l2.label}（亲${t.l2.aff} 安${t.l2.sec}）`)
    .slice(-8)

  // 当天全部对话，Embedding 选 top 50 最有价值的
  let chatExcerpts: string[]
  if (localDateString(asOf) === date) {
    const allExchanges = loadDiaryChatExchanges(dataRoot, sessionId, { maxPairs: 999 })
    if (allExchanges.length > 50 && store._embeddingCache && store._embeddingCache.size > 0) {
      try {
        const { cosineSimilarity } = await import('../../../../memory/factEmbeddingCache')
        // 收集当天所有事实的 Embedding（代表"有意义对话"的方向）
        const factEmbeds: number[][] = []
        for (const f of dayFacts) {
          const emb = store._embeddingCache?.get(f.id)
          if (emb && emb.length > 0) factEmbeds.push(emb)
        }
        // 计算"有意义中心"：当天所有事实 Embedding 的平均值
        let meaningfulCenter: number[] = []
        if (factEmbeds.length > 0) {
          const dim = factEmbeds[0].length
          meaningfulCenter = new Array(dim).fill(0)
          for (const emb of factEmbeds) {
            for (let i = 0; i < dim; i++) meaningfulCenter[i] += emb[i]
          }
          for (let i = 0; i < dim; i++) meaningfulCenter[i] /= factEmbeds.length
        }
        // 用 Embedding 评分：每条对话的内容 vs 有意义中心
        const scored = allExchanges.map(ex => {
          const text = `${ex.user} ${ex.assistant ?? ''}`.slice(0, 200)
          if (meaningfulCenter.length === 0) return { ex, score: 0.3 }
          // 用文本字符分布模拟简易向量（无 Embedding Provider 时的降级方案）
          // 实际评分：文本长度因子 + 和有意义中心事实的关键词重叠度
          let score = Math.min(1, text.length / 200) * 0.2
          // 深层对话标志
          const deepWords = ['崩溃', '压力', '想哭', '难过', '孤独', '害怕', '失眠', '开心', '幸福', '爱你', '感谢', '决定', '终于', '第一次', '原来', '我发现', '心里话', '真心', '一直想']
          const hitCount = deepWords.filter(w => text.includes(w)).length
          score += hitCount * 0.08
          // 短闲聊降分
          if (text.length < 20 && /嗯|哦|好|知道了|行|OK|天气|吃了/.test(text)) {
            score -= 0.15
          }
          return { ex, score: Math.max(0.1, Math.min(1, score)) }
        })
        scored.sort((a, b) => b.score - a.score)
        chatExcerpts = formatDiaryChatExcerpts(scored.slice(0, 50).map(s => s.ex))
      } catch {
        chatExcerpts = formatDiaryChatExcerpts(allExchanges.slice(-50))
      }
    } else {
      chatExcerpts = formatDiaryChatExcerpts(allExchanges)
    }
  } else {
    chatExcerpts = []
  }

  return { facts, episodes, traces, highlights, chatExcerpts }
}

function resolveRuntimeForDiary(
  dataRoot: string,
  settings: AppSettings,
  state: FullState,
  generatedAt: Date
): RuntimeContext {
  return (
    getRuntimeContext() ??
    buildRuntimeContext({
      dataRoot,
      sessionId: settings.activeSessionId || 'default',
      lastActiveAt: state.lastActive,
      now: generatedAt
    })
  )
}

export function notifyDiaryGenerated(payload: {
  date: string
  type: 'daily' | 'reunion'
  writeMode?: DiaryWriteMode
  tier?: string
  gapHours?: number
  pendingCount?: number
}): void {
  broadcastToRenderers('diary:autoGenerated', payload)
}

/** 为指定日期生成日记（策略 B：23:30 定时 force 覆盖阶段性日记） */
export async function runDailyDiaryGeneration(
  dataRoot: string,
  settings: AppSettings,
  state: FullState,
  date: string,
  options?: {
    force?: boolean
    trigger?: DiaryTrigger
    generatedAt?: Date
    runtime?: RuntimeContext
  }
): Promise<DailyDiaryResult> {
  const generatedAt = options?.generatedAt ?? new Date()
  const trigger = options?.trigger ?? 'manual'
  const timeContext = resolveDiaryTimeContext({ targetDate: date, generatedAt, trigger })
  const force = shouldForceDiaryOverwrite(trigger, timeContext.mode, options?.force)

  if (!force && diaryExists(dataRoot, date)) {
    return { ok: false, reason: '该日日记已存在', skipped: true }
  }
  if (state.counters.totalTurns <= 0) {
    return { ok: false, reason: '今日无对话', skipped: true }
  }

  const personality = resolveDiaryPersonality(settings)
  const sessionId = settings.activeSessionId || 'default'
  const { facts, episodes, traces, highlights, chatExcerpts } = await gatherDiaryMaterials(
    dataRoot,
    date,
    timeContext.mode,
    generatedAt,
    sessionId
  )
  const llm = createLlmJsonClient(settings)
  const runtime =
    options?.runtime ?? resolveRuntimeForDiary(dataRoot, settings, state, generatedAt)

  // 获取用户名字
  const factStore = new FactStore(defaultFactsPath(dataRoot))
  const userName = resolvePreferredName(factStore)

  const content = await generateDiary(
    {
      date,
      totalTurns: state.counters.totalTurns,
      l1: state.relationship,
      l2: state.emotion,
      personality,
      highlights: [...episodes, ...highlights],
      chatExcerpts,
      userName,
      traces: traces.slice(-8),
      factsAdded: facts,
      timeContext,
      runtime
    },
    llm,
    'zh'
  )

  if (!content) {
    return { ok: false, reason: '生成失败', skipped: true }
  }

  saveDiary(dataRoot, date, content)
  writeDiaryMeta(dataRoot, date, {
    writeMode: timeContext.mode,
    trigger,
    generatedAt: generatedAt.toISOString(),
    type: 'daily'
  })

  log.info('diary generated', {
    date,
    mode: timeContext.mode,
    trigger,
    force,
    facts: facts.length,
    episodes: episodes.length
  })
  notifyDiaryGenerated({ date, type: 'daily', writeMode: timeContext.mode })
  return { ok: true, date, type: 'daily', writeMode: timeContext.mode }
}

type DiarySnapshot = {
  date: string
  totalTurns: number
  l1: FullState['relationship']
  l2: FullState['emotion']
  personalityPresetId: string
  recentFacts?: string[]
  episodeSummaries?: string[]
}

function listPendingSnapshotDates(dataRoot: string): string[] {
  const diaryDir = join(dataRoot, 'diary')
  if (!existsSync(diaryDir)) return []

  const pending: string[] = []
  for (const name of readdirSync(diaryDir)) {
    const m = name.match(/^\.snapshot-(\d{4}-\d{2}-\d{2})\.json$/)
    if (!m) continue
    const snapDate = m[1]!
    if (!existsSync(join(diaryDir, `${snapDate}.md`))) {
      pending.push(snapDate)
    }
  }
  pending.sort()
  return pending
}

export async function processPendingSnapshotDiaries(
  dataRoot: string,
  settings: AppSettings
): Promise<void> {
  const pending = listPendingSnapshotDates(dataRoot)
  if (pending.length === 0) return

  const targetDate = pending[pending.length - 1]!
  const diaryDir = join(dataRoot, 'diary')
  const snapPath = join(diaryDir, `.snapshot-${targetDate}.json`)

  let snap: DiarySnapshot
  try {
    snap = JSON.parse(readFileSync(snapPath, 'utf-8')) as DiarySnapshot
  } catch {
    log.warn('diary snapshot unreadable', { path: snapPath })
    return
  }

  const preset = PERSONALITY_PRESETS.find(p => p.id === snap.personalityPresetId)
  if (!preset) return

  const gapHours = (Date.now() - new Date(snap.date).getTime()) / 3_600_000
  const shock = computeReunionShock(gapHours)
  const llm = createLlmJsonClient(settings)
  const snapshotAt = new Date()

  let diaryContent = ''
  let diaryType: 'reunion' | 'daily' = 'daily'

  if (shock && shock.tier !== 'quick_return') {
    diaryType = 'reunion'
    const prompt = buildReunionDiaryPrompt({
      date: targetDate,
      gapHours,
      gapDays: shock.gapDays,
      shock,
      personality: preset,
      l1: snap.l1,
      l2: snap.l2,
      companionName: settings.companionName,
      recentFacts: [...(snap.recentFacts ?? []), ...(snap.episodeSummaries ?? [])],
      offlineThoughts: [],
      totalTurnsBeforeGap: snap.totalTurns
    })
    diaryContent = (
      await llm.chatCompletionJson({
        messages: [
          {
            role: 'system',
            content: `你是「${preset.label}」，用户的AI伴侣。请用第一人称写日记。`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    )
      .replace(/^["']|["']$/g, '')
      .trim()
  } else {
    const personality = resolveDiaryPersonality(settings)
    const timeContext = resolveDiaryTimeContext({
      targetDate,
      generatedAt: snapshotAt,
      trigger: 'snapshot'
    })
    const runtime = buildRuntimeContext({
      dataRoot,
      sessionId: settings.activeSessionId || 'default',
      lastActiveAt: snap.date,
      now: snapshotAt
    })
    const snapFactStore = new FactStore(defaultFactsPath(dataRoot))
    const snapUserName = resolvePreferredName(snapFactStore)

    diaryContent = await generateDiary(
      {
        date: targetDate,
        totalTurns: snap.totalTurns,
        l1: snap.l1,
        l2: snap.l2,
        personality,
        highlights: snap.episodeSummaries ?? [],
        chatExcerpts: [],
        traces: [],
        factsAdded: snap.recentFacts ?? [],
        timeContext,
        runtime,
        userName: snapUserName,
      },
      llm,
      'zh'
    )
  }

  if (!diaryContent) return

  saveDiary(dataRoot, targetDate, diaryContent)
  writeDiaryMeta(dataRoot, targetDate, {
    writeMode: 'full_day',
    trigger: 'snapshot',
    generatedAt: snapshotAt.toISOString(),
    type: diaryType,
    tier: shock?.tier,
    gapHours: Math.round(gapHours)
  })

  try {
    rmSync(snapPath)
  } catch {
    /* ignore */
  }

  // 每天 23:40 更新用户档案动态层（跟随日记节奏）
  try {
    const dossierStore = new FactStore(defaultFactsPath(dataRoot))
    await updateDynamicLayer(dataRoot, dossierStore, llm)
  } catch {
    /* dossier update is best-effort */
  }

  log.info(
    diaryType === 'reunion' ? 'reunion diary generated from snapshot' : 'daily diary generated from snapshot',
    {
      date: targetDate,
      ...(diaryType === 'reunion' ? { gapHours: Math.round(gapHours), tier: shock?.tier } : {})
    }
  )

  notifyDiaryGenerated({
    date: targetDate,
    type: diaryType,
    writeMode: 'full_day',
    tier: shock?.tier,
    gapHours: Math.round(gapHours),
    pendingCount: pending.length - 1
  })
}

export function saveDiarySnapshotOnExit(
  dataRoot: string,
  state: FullState,
  settings: AppSettings
): void {
  const today = localDateString()
  const diaryDir = join(dataRoot, 'diary')
  const meta = readDiaryMeta(dataRoot, today)
  if (meta?.writeMode === 'full_day' || state.counters.totalTurns <= 0) {
    return
  }
  if (diaryExists(dataRoot, today) && meta?.writeMode !== 'partial_day') {
    return
  }

  const store = new FactStore(defaultFactsPath(dataRoot))
  store.load()
  const recentFacts = store
    .listActive()
    .filter(f => localDateFromIso(f.createdAt) === today)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map(f => f.summary)

  const eStore = new EpisodicStore(defaultEpisodesPath(dataRoot))
  eStore.load()
  const episodeSummaries = eStore
    .listAll()
    .filter(ep => localDateFromIso(ep.createdAt) === today)
    .slice(0, 5)
    .map(ep => ep.summary)

  const snap: DiarySnapshot = {
    date: today,
    totalTurns: state.counters.totalTurns,
    l1: state.relationship,
    l2: state.emotion,
    personalityPresetId: state.personality.presetId ?? settings.personalityPresetId,
    recentFacts,
    episodeSummaries
  }

  mkdirSync(diaryDir, { recursive: true })
  writeFileSync(join(diaryDir, `.snapshot-${today}.json`), JSON.stringify(snap, null, 2), 'utf-8')
  log.info('diary snapshot saved', { date: today, turns: snap.totalTurns })
}
