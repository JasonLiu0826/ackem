import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from './settings'
import { resolveDataRoot } from './paths'
import type { ChunkRecord, IndexSnapshot } from './indexer'
import { buildSystemPrompt } from './prompt/main-chat'
import { searchChunks } from './indexer'
import { assertReadableUnderDataRoot } from './whitelist'
import { PERSONALITY_PRESETS, buildPresetVoiceGuide, type PersonalityPreset } from './personalityPresets'
import type { DispatchCatalogEntry, DispatchResult } from './extensions/protocols'

export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }

export type BuildContextArgs = {
  userText: string
  /** @path optional explicit attachment like memory/foo.md */
  explicitRel?: string
  recentMessages: { role: 'user' | 'assistant'; content: string }[]
  index: IndexSnapshot
  settings: AppSettings
  /** L3 心理状态块（编排层注入） */
  psycheBlock?: string
  /** 记忆检索 Tier B（编排层注入；若提供则不再用 TF-IDF 自建 Tier B） */
  tierBBlock?: string
  /** 隐藏系统提示：注入psyche block但不显示给用户（如归档取消检测） */
  systemHint?: string
  /** 扩展模块上下文注入（GameMode 等） */
  extensionInjections?: string[]
  /** 用户信息块（名字+年龄+档案），由编排层注入 */
  userInfoBlock?: string
  /** Wave 路径：覆盖 tierB（如延后 enrich 结果） */
  tierBOverride?: string
  /** Wave 路径：追加到 psyche 块末尾 */
  psycheAppend?: string
  /** Wave 路径：跳过 index TF-IDF fallback（引擎 tierB 为空时） */
  omitIndexTierB?: boolean
}

/** 合并扩展/调度注入，统一由 assembleMessages 写入 system 的【扩展上下文】 */
export function mergeExtensionContextInjections(args: {
  coordinatorInjections?: string[]
  weatherPreInjection?: string | null
  dispatchInjections?: string[]
  dispatchResult?: DispatchResult
  dispatchCatalogEntry?: Pick<DispatchCatalogEntry, 'name' | 'dispatch'>
}): string[] {
  const merged: string[] = []
  const pushUnique = (s: string | null | undefined) => {
    const t = s?.trim()
    if (!t || merged.includes(t)) return
    merged.push(t)
  }
  for (const s of args.coordinatorInjections ?? []) pushUnique(s)
  pushUnique(args.weatherPreInjection)
  for (const s of args.dispatchInjections ?? []) pushUnique(s)
  if (args.dispatchResult?.decision === 'auto_invoke') {
    const summary =
      args.dispatchResult.contextInjection?.trim() ||
      (args.dispatchCatalogEntry
        ? `【扩展调度】已触发 ${args.dispatchCatalogEntry.name}：${args.dispatchCatalogEntry.dispatch.summary}`
        : undefined)
    pushUnique(summary)
  }
  return merged
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const end = md.indexOf('\n---', 3)
  if (end === -1) return md
  return md.slice(end + 4).trim()
}

function readTierACompanion(dataRoot: string, settings: AppSettings): string {
  // 🆕 读当前人格，生成动态风格描述
  const stateJsonPath = join(dataRoot, 'companion', 'state.json')
  let personalityHint = settings.companionSystemHint
  let personalityLabel = settings.companionName
  let voiceGuide = ''
  let preset: PersonalityPreset | undefined
  let ownerProfileHint = ''
  if (existsSync(stateJsonPath)) {
    try {
      const st = JSON.parse(readFileSync(stateJsonPath, 'utf-8'))
      if (st.personality?.presetId) {
        preset = PERSONALITY_PRESETS.find(p => p.id === st.personality.presetId)
        if (preset) {
          personalityLabel = preset.label
          personalityHint = buildPersonalityHint(preset, settings.adultContentMode)
          voiceGuide = buildPresetVoiceGuide(preset, settings.adultContentMode)
        }
      }
      if (settings.personalityConfigMode === 'inferred') {
        const six = st.userSixDimensions
        if (six && typeof six.E === 'number') {
          ownerProfileHint = `\n主人画像（导入推断，勿复述）：表达${six.E} 依恋${six.A} 直接${six.D} 权力${six.P} 情感${six.N} 开放${six.O}`
        }
      }
    } catch { /* ignore */ }
  }
  if (!preset) {
    const fromSettings = PERSONALITY_PRESETS.find(p => p.id === settings.personalityPresetId)
    if (fromSettings) {
      preset = fromSettings
      personalityLabel = fromSettings.label
      personalityHint = buildPersonalityHint(fromSettings, settings.adultContentMode)
      voiceGuide = buildPresetVoiceGuide(fromSettings, settings.adultContentMode)
    }
  }

  const statePath = join(dataRoot, 'companion', 'state.md')
  let state = ''
  if (existsSync(statePath)) {
    state = stripFrontmatter(readFileSync(statePath, 'utf-8')).trim().slice(0, 2000)
  }
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return [
    `【Tier A · 伴侣快照】`,
    `当前日期：${dateStr}`,
    `称呼：${settings.companionName}`,
    `当前人格：${personalityLabel}`,
    voiceGuide ? `【人格口吻 · 全轮优先】\n${voiceGuide}` : '',
    `风格参数：${personalityHint}`,
    ownerProfileHint,
    state ? `状态摘录：\n${state}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** 🆕 根据人格预设生成动态风格提示 */
function buildPersonalityHint(preset: { label: string; T: number; I: number; S: number; O: number; R: number; tags?: string[] }, adultMode: boolean): string {
  const parts: string[] = []

  // 温柔
  if (preset.T >= 90) parts.push('极度温柔包容')
  else if (preset.T >= 70) parts.push('温柔')
  else if (preset.T <= 20) parts.push('冷淡疏离')
  else if (preset.T <= 35) parts.push('不轻易流露温暖')

  // 主动
  if (preset.I >= 80) parts.push('主动强势')
  else if (preset.I >= 60) parts.push('比较主动')
  else if (preset.I <= 25) parts.push('被动回应型')

  // 敏感
  if (preset.S >= 75) parts.push('情绪反应强烈')
  else if (preset.S <= 20) parts.push('情绪极为稳定')

  // 理性
  if (preset.R >= 85) parts.push('极度理性冷静')
  else if (preset.R <= 25) parts.push('感性冲动')

  // 特殊标签
  if (preset.tags?.includes('provoke-submit')) parts.push('嘴欠挑衅型，最终会服软')
  if (preset.tags?.includes('dual-persona')) parts.push(adultMode ? '表面乖巧下隐藏着极度色情的另一面' : '表面乖巧羞涩')
  if (preset.tags?.includes('maternal')) parts.push('母性包容')
  if (preset.tags?.includes('paternal')) parts.push('父性保护')
  if (preset.tags?.includes('nurturing')) parts.push('关怀引导型')

  const base = `用「我」指代自己（AI 伴侣），不用「我」指代用户。${adultMode ? '已开启成人内容模式，对两性话题正常回应，不回避。' : ''}`
  return parts.length > 0 ? `${parts.join('，')}。${base}` : base
}

function formatChunkInjection(chunks: ChunkRecord[]): string {
  if (chunks.length === 0) return ''
  const lines = chunks.map((c, i) => {
    const ref = `[${c.relPath}#${c.start}-${c.end}]`
    return `${ref}\n${c.text.trim()}`
  })
  return `【Tier B · 检索记忆片段】\n${lines.join('\n\n---\n\n')}`
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '\n…（已截断，见单文件软上限设置）'
}

// 委托到 prompt/ 模块
export { buildSystemPrompt } from './prompt/main-chat'

export function assembleMessages(args: BuildContextArgs): ChatMessage[] {
  const {
    userText,
    explicitRel,
    recentMessages,
    index,
    settings,
    psycheBlock,
    tierBBlock,
    systemHint,
    extensionInjections,
    userInfoBlock,
    tierBOverride,
    psycheAppend,
    omitIndexTierB
  } = args
  const dataRoot = resolveDataRoot(settings)
  const tierA = readTierACompanion(dataRoot, settings)

  const useEngineTierB = tierBBlock !== undefined || tierBOverride !== undefined
  let tierBFromIndex = ''
  if (!useEngineTierB && !omitIndexTierB) {
    const hits = searchChunks(index, userText, 12)
    const picked: ChunkRecord[] = []
    let used = 0
    const budget = settings.memoryBudgetChars
    for (const h of hits) {
      const block = h.chunk.text.length + 40
      if (used + block > budget) break
      picked.push(h.chunk)
      used += block
    }
    tierBFromIndex = formatChunkInjection(picked)
  }

  const engineTierB = (tierBOverride ?? tierBBlock)?.trim() ? (tierBOverride ?? tierBBlock) : ''
  const tierBCombined = [engineTierB, useEngineTierB || omitIndexTierB ? '' : tierBFromIndex].filter(Boolean).join('\n\n')

  let tierC = ''
  if (explicitRel) {
    const safe = assertReadableUnderDataRoot(dataRoot, explicitRel)
    if (safe) {
      const abs = join(dataRoot, safe)
      if (existsSync(abs)) {
        const raw = readFileSync(abs, 'utf-8')
        tierC = `【Tier C · 用户指定文档 ${safe}】\n${clip(raw, settings.singleFileSoftLimitBytes)}`
      }
    }
  }
  const psyche = psycheBlock?.trim() ?? ''
  const hint = systemHint?.trim() ?? ''
  const append = psycheAppend?.trim() ?? ''
  const psycheWithHint = [psyche, hint, append].filter(Boolean).join('\n\n')
  const extBlock = (extensionInjections ?? [])
    .filter((s) => s && s.trim().length > 0)
    .join('\n')
  const userInfo = userInfoBlock?.trim() ?? ''
  const sysParts = [
    buildSystemPrompt(settings),
    tierA,
    userInfo ? `【关于 ta 的笔记 · 仅供你内心参考】\n${userInfo}` : '',
    psycheWithHint,
    tierBCombined,
    tierC,
    extBlock ? `【扩展上下文】\n${extBlock}` : ''
  ].filter((p) => p && p.trim().length > 0)
  const system = sysParts.join('\n\n')
  const msgs: ChatMessage[] = [{ role: 'system', content: system }]
  for (const m of recentMessages.slice(-20)) {
    msgs.push({ role: m.role, content: m.content })
  }
  msgs.push({ role: 'user', content: userText })
  return msgs
}
