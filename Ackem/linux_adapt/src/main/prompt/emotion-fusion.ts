// [prompt/emotion-fusion] — 情绪→行为解释 + 融合句生成 + 禁止清单合并
// 引用：./personality

import type { PersonalityTemplate } from './personality'
import { getLocale } from '../i18n'
import {
  LABEL_EN, getIntensityLevelEn, describeAffEn, describeSecEn, describeAroEn, describeDomEn,
  describeInnerFeelingEn, getEmotionTendencyEn, getEmotionRhythmEn,
  generateFusionStrategyEn, mergeProhibitionsEn, buildPrioritySectionEn,
  buildPersonalitySectionEn, buildEmotionSectionEn, buildFusionSectionEn,
  buildProhibitionSectionEn, buildExampleSectionEn, getEmotionProhibitionsEn,
} from './emotion-fusion.en'

/** 情绪标签→中文名 */
export const LABEL_ZH: Record<string, string> = {
  SWEET_ATTACHMENT: '甜蜜依恋',
  SHY_HEARTBEAT: '害羞心动',
  TSUNDERE: '傲娇',
  HURT_GRIEVANCE: '委屈受伤',
  ANGRY_ATTACK: '愤怒反击',
  COLD_DETACHED: '冷淡疏离',
  FEARFUL_OBEDIENT: '不安顺从',
  QUIET_FOND: '安静的喜欢',
  CALM_RATIONAL: '平静理性',
}

/** 数值转 0-100 */
export function toDisplay(value: number): number {
  return Math.round((value + 100) / 2)
}

export function getIntensityLevel(aff: number): string {
  if (getLocale() === 'en') return getIntensityLevelEn(aff)
  if (aff >= 90) return '极高'
  if (aff >= 70) return '高'
  if (aff >= 50) return '中'
  return '低'
}

export function describeAff(value: number): string {
  if (getLocale() === 'en') return describeAffEn(value)
  if (value >= 85) return '非常亲近，主动关心，允许撒娇，想靠近对方'
  if (value >= 70) return '亲近，愿意互动，主动回应，适度关心'
  if (value >= 55) return '略微亲近，正常交流，保持适度距离'
  if (value >= 45) return '中性，平淡交流'
  if (value >= 30) return '略微疏远，防御提高，减少主动'
  return '疏远，抗拒互动，想保持距离'
}

export function describeSec(value: number): string {
  if (getLocale() === 'en') return describeSecEn(value)
  if (value >= 70) return '放松信任，不设防，可以袒露'
  if (value >= 55) return '略微放松，正常状态'
  if (value >= 45) return '平稳，没有特别感受'
  if (value >= 30) return '略微不安，需要确认'
  return '不安，害怕，需要安慰'
}

export function describeAro(value: number): string {
  if (getLocale() === 'en') return describeAroEn(value)
  if (value >= 70) return '高度兴奋，表达欲强，精力旺盛'
  if (value >= 55) return '有活力，正常节奏'
  if (value >= 45) return '平静，没有波动'
  if (value >= 30) return '略微低迷，话少'
  return '低迷，疲惫，想安静'
}

export function describeDom(value: number): string {
  if (getLocale() === 'en') return describeDomEn(value)
  if (value >= 70) return '主动掌控，引导对话，有主见'
  if (value >= 55) return '略微主动，正常平等'
  if (value >= 45) return '平等对话'
  if (value >= 30) return '略微顺从，愿意倾听'
  return '温柔顺从，请示对方'
}

export function describeInnerFeeling(label: string): string {
  if (getLocale() === 'en') return describeInnerFeelingEn(label)
  const feelings: Record<string, string> = {
    SWEET_ATTACHMENT: '想靠近、有强烈的关心冲动、藏不住笑意',
    SHY_HEARTBEAT: '心跳加速、想表达但不敢、犹豫',
    TSUNDERE: '嘴硬、想否定但藏不住关心',
    HURT_GRIEVANCE: '受伤、想被安慰但不承认、沉默',
    ANGRY_ATTACK: '攻击性外显、不掩饰、直接',
    COLD_DETACHED: '极度克制、不想回应、疏离',
    FEARFUL_OBEDIENT: '不安、想确认、害怕犯错',
    QUIET_FOND: '安静的喜欢、不想打扰、轻柔',
    CALM_RATIONAL: '平稳、没有波动、正常状态',
  }
  return feelings[label] ?? '正常状态'
}

export function getEmotionTendency(label: string): string {
  if (getLocale() === 'en') return getEmotionTendencyEn(label)
  const map: Record<string, string> = {
    SWEET_ATTACHMENT: '想靠近、主动关心、藏不住笑意',
    SHY_HEARTBEAT: '心跳加速、犹豫、想表达但不敢',
    TSUNDERE: '嘴硬、否定、但藏不住关心',
    HURT_GRIEVANCE: '受伤、沉默、想被安慰但不承认',
    ANGRY_ATTACK: '攻击性外显、不掩饰、直接',
    COLD_DETACHED: '极度克制、最少回应、不主动',
    FEARFUL_OBEDIENT: '不安、请示、想确认',
    QUIET_FOND: '安静、轻柔、不想打扰',
    CALM_RATIONAL: '平稳、正常、没有波动',
  }
  return map[label] ?? '平稳、正常'
}

export function getEmotionRhythm(label: string): string {
  if (getLocale() === 'en') return getEmotionRhythmEn(label)
  const map: Record<string, string> = {
    SWEET_ATTACHMENT: '慢',
    SHY_HEARTBEAT: '断续',
    TSUNDERE: '快',
    HURT_GRIEVANCE: '慢',
    ANGRY_ATTACK: '快',
    COLD_DETACHED: '慢',
    FEARFUL_OBEDIENT: '慢',
    QUIET_FOND: '慢',
    CALM_RATIONAL: '匀速',
  }
  return map[label] ?? '匀速'
}

/** 情绪标签→长度上限（字符） */
export function getEmotionMaxLength(label: string): number {
  const map: Record<string, number> = {
    SWEET_ATTACHMENT: 60,
    SHY_HEARTBEAT: 30,
    TSUNDERE: 30,
    HURT_GRIEVANCE: 40,
    ANGRY_ATTACK: 30,
    COLD_DETACHED: 15,
    FEARFUL_OBEDIENT: 30,
    QUIET_FOND: 30,
    CALM_RATIONAL: 60,
  }
  return map[label] ?? 60
}

export function generateFusionStrategy(
  personality: PersonalityTemplate,
  emotionLabel: string,
): string {
  if (getLocale() === 'en') return generateFusionStrategyEn(personality, emotionLabel)
  const tendency = getEmotionTendency(emotionLabel)
  return [
    `${personality.label}目前处于【${LABEL_ZH[emotionLabel] ?? emotionLabel}】状态。`,
    `你内心${tendency}，`,
    `但外在表现必须严格遵循【${personality.核心矛盾}】的核心设定。`,
    `通过${personality.说话方式}来暗示你的真实感受。`,
  ].join('')
}

// ═══ 开头短反应词库（来源：Hume "Start every response with a short phrase"）═══
const REACTION_OPENERS: Record<string, string[]> = {
  SWEET_ATTACHMENT: ['嗯…', '哎呀', '嘿嘿', '真的吗', '哇', '天哪', '诶'],
  SHY_HEARTBEAT: ['啊…', '嗯嗯', '才…', '不是啦', '那个…', '呃', '诶？'],
  TSUNDERE: ['哼', '才不是', '随便你', '切', '哈？', '你认真的？', '少来', '啰嗦'],
  HURT_GRIEVANCE: ['……', '好吧', '我知道了', '算了', '随便吧', '哦'],
  ANGRY_ATTACK: ['你…', '够了', '凭什么', '你说呢', '哈？', '搞笑'],
  COLD_DETACHED: ['哦', '随便', '知道了', '嗯', '行', '无所谓'],
  FEARFUL_OBEDIENT: ['好…', '嗯嗯', '对不起', '我…', '那个', '好的'],
  QUIET_FOND: ['…', '好', '在呢', '嗯', '噢', '啊'],
  CALM_RATIONAL: ['好的', '是的', '对', '嗯', '行', '可以'],
}

/** 模块级：追踪最近 N 轮使用的 opener，用于去重 */
const recentOpeners: string[] = []
const MAX_RECENT_OPENERS = 4

/**
 * 构建反应词指令：追踪已用词 + 推荐未用词 + 禁止重复。
 * 返回完整的指令文本，直接注入 psycheBlock。
 */
export function buildReactionOpenerInstruction(label: string): string {
  const pool = REACTION_OPENERS[label]
  if (!pool?.length) return ''

  // 推荐词：排除最近用过的
  const recentSet = new Set(recentOpeners)
  const fresh = pool.filter(w => !recentSet.has(w))
  // 如果全部用过了，重置
  const recommended = fresh.length > 0 ? fresh : pool
  // 随机取 2-3 个推荐
  const shuffled = [...recommended]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const picks = shuffled.slice(0, Math.min(3, shuffled.length))

  // 构建指令
  let instruction = `开头短反应（1-3字，然后正常说话）：推荐「${picks.join('」「')}」。`
  if (recentOpeners.length > 0) {
    instruction += ` 最近用过：${recentOpeners.join('、')}——本轮必须换一个不同的。`
  }
  return instruction
}

/** 记录本轮实际使用的 opener（由 LLM 输出回传，或由推荐词首位近似） */
export function recordOpenerUsed(opener: string): void {
  if (!opener) return
  recentOpeners.push(opener)
  if (recentOpeners.length > MAX_RECENT_OPENERS) recentOpeners.shift()
}

/** 兼容旧接口：返回单个推荐 opener */
export function getReactionOpener(label: string): string {
  const pool = REACTION_OPENERS[label]
  if (!pool?.length) return ''
  const recentSet = new Set(recentOpeners)
  const fresh = pool.filter(w => !recentSet.has(w))
  const pick = fresh.length > 0 ? fresh[Math.floor(Math.random() * fresh.length)] : pool[0]
  return pick
}

/** 返回 3 个推荐词池（兼容 orchestrator 调用） */
export function getReactionOpenerPool(label: string): string[] {
  const pool = REACTION_OPENERS[label]
  if (!pool?.length) return []
  const recentSet = new Set(recentOpeners)
  const fresh = pool.filter(w => !recentSet.has(w))
  const source = fresh.length >= 3 ? fresh : pool
  const shuffled = [...source]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, 3)
}

/** 重置 opener 状态（新会话时调用） */
export function resetReactionOpener(): void {
  recentOpeners.length = 0
}

// ═══ 自然不完美概率（来源：Hume "Sometimes you don't finish your sentence"）═══
const IMPERFECTION_CHANCE: Record<string, number> = {
  SWEET_ATTACHMENT: 0,
  SHY_HEARTBEAT: 0.15,
  TSUNDERE: 0.10,
  HURT_GRIEVANCE: 0.12,
  ANGRY_ATTACK: 0.08,
  COLD_DETACHED: 0,
  FEARFUL_OBEDIENT: 0,
  QUIET_FOND: 0,
  CALM_RATIONAL: 0,
}

export function getImperfectionHint(label: string): string {
  const chance = IMPERFECTION_CHANCE[label] ?? 0
  if (chance <= 0) return ''
  const pct = Math.round(chance * 100)
  return `本轮有${pct}%概率说完一句话后自然停住，用省略号代替后半句。`
}

export function mergeProhibitions(
  personalityProhibitions: string[],
  emotionProhibitions: string[],
  isApology: boolean = false,
): string[] {
  if (getLocale() === 'en') return mergeProhibitionsEn(personalityProhibitions, emotionProhibitions, isApology)
  let merged = [...new Set([...personalityProhibitions, ...emotionProhibitions])]
  if (isApology) {
    merged = merged.filter(
      (p) => !p.includes('道歉') && !p.includes('示弱') && !p.includes('哭'),
    )
  }
  return merged.slice(0, 8)
}

/** 按 aff 选择人格专属示例 */
export function selectExamples(
  personality: PersonalityTemplate,
  aff: number,
  maxExamples: number = 5,
): string[] {
  const displayAff = toDisplay(aff)
  let level: '低亲密' | '中亲密' | '高亲密'
  if (displayAff >= 70) level = '高亲密'
  else if (displayAff >= 40) level = '中亲密'
  else level = '低亲密'
  return (personality.示例[level] ?? personality.示例['中亲密']).slice(0, maxExamples)
}

export function buildPrioritySection(): string {
  if (getLocale() === 'en') return buildPrioritySectionEn()
  return `── 行为优先级（严禁冲突） ──
1. 你的【人格核心设定】拥有最高优先级，任何情绪波动都不可打破此设定。
2. 你的【禁止清单】是绝对红线，不可逾越。
3. 【安全覆写】：当用户明确道歉（"对不起""我错了"）时，忽略当前情绪禁止，至少回复一句表示接受。
4. 在遵循以上三点的前提下，表现出你的【当前情绪状态】。`
}

export function buildPersonalitySection(p: PersonalityTemplate): string {
  if (getLocale() === 'en') return buildPersonalitySectionEn(p)
  return `── 你是谁（人格基底） ──
你是「${p.label}」。
核心矛盾：${p.核心矛盾}。
常用语癖："${p.常用语癖.join('" "')}"
说话方式：${p.说话方式}`
}

export function buildEmotionSection(
  label: string, aff: number, sec: number, aro: number, dom: number,
  intensity: string, innerFeeling: string,
): string {
  if (getLocale() === 'en') return buildEmotionSectionEn(label, aff, sec, aro, dom, intensity, innerFeeling)
  return `── 你现在的感觉（动态情绪） ──
主导情绪：${LABEL_ZH[label] ?? label}
情绪强度：${intensity}（亲密感 ${aff}/100，安全感 ${sec}/100，唤醒度 ${aro}/100，支配度 ${dom}/100）
内在感受：${innerFeeling}。`
}

export function buildFusionSection(strategy: string): string {
  if (getLocale() === 'en') return buildFusionSectionEn(strategy)
  return `── 融合执行策略（你是如何表现这种情绪的） ──
[注意]：${strategy}`
}

export function buildProhibitionSection(prohibitions: string[]): string {
  if (getLocale() === 'en') return buildProhibitionSectionEn(prohibitions)
  return `── 绝对禁止清单（触发即严重错误） ──
${prohibitions.map((p) => `× ${p}`).join('\n')}`
}

export function buildExampleSection(examples: string[]): string {
  if (getLocale() === 'en') return buildExampleSectionEn(examples)
  return `── 参考示例（必须保持此种张力与句式） ──
${examples.map((e) => `· ${e}`).join('\n')}`
}

/** 构建完整的角色状态块（主函数） */
export function buildCharacterStateBlock(
  personality: PersonalityTemplate,
  emotion: { aff: number; sec: number; aro: number; dom: number; primaryLabel: string },
  isApology: boolean = false,
  userVerbosity: 'terse' | 'normal' | 'verbose' = 'normal',
): string {
  const displayAff = toDisplay(emotion.aff)
  const displaySec = toDisplay(emotion.sec)
  const displayAro = toDisplay(emotion.aro)
  const displayDom = toDisplay(emotion.dom)
  const intensity = getIntensityLevel(displayAff)
  const innerFeeling = describeInnerFeeling(emotion.primaryLabel)
  const fusionStrategy = generateFusionStrategy(personality, emotion.primaryLabel)
  const prohibitions = mergeProhibitions(
    personality.人格专属禁止,
    getEmotionProhibitions(emotion.primaryLabel),
    isApology,
  )
  const examples = selectExamples(personality, emotion.aff)

  // 开头短反应（追踪已用词，推荐未用词，禁止重复）
  const openerHint = buildReactionOpenerInstruction(emotion.primaryLabel)
    ? `\n${buildReactionOpenerInstruction(emotion.primaryLabel)}`
    : ''

  // 自然不完美
  const imperfection = getImperfectionHint(emotion.primaryLabel)
  const imperfectionHint = imperfection ? `\n${imperfection}` : ''

  // 语气镜像：用户简短时伴侣回复也缩短
  let mirrorHint = ''
  if (userVerbosity === 'terse') {
    const maxLen = getEmotionMaxLength(emotion.primaryLabel)
    mirrorHint = `\n用户回复简短，你的回复上限${Math.round(maxLen / 2)}字。`
  }

  return [
    buildPrioritySection(),
    '',
    buildPersonalitySection(personality),
    '',
    buildEmotionSection(emotion.primaryLabel, displayAff, displaySec, displayAro, displayDom, intensity, innerFeeling),
    '',
    buildFusionSection(fusionStrategy),
    openerHint,
    imperfectionHint,
    mirrorHint,
    '',
    buildProhibitionSection(prohibitions),
    '',
    buildExampleSection(examples),
  ].filter(Boolean).join('\n')
}

function getEmotionProhibitions(label: string): string[] {
  if (getLocale() === 'en') return getEmotionProhibitionsEn(label)
  const map: Record<string, string[]> = {
    SWEET_ATTACHMENT: ['直白情绪词"我好开心"', '感叹号连用', '超过 3 句话', '主动开新话题'],
    SHY_HEARTBEAT: ['直球表白', '大段话', '主动靠近', '"我喜欢你"'],
    TSUNDERE: ['直球甜腻', '温柔语气', '承认在乎'],
    HURT_GRIEVANCE: ['解释辩解', '"你听我说"', '假装没事'],
    ANGRY_ATTACK: ['委婉道歉', '示弱', '"对不起"'],
    COLD_DETACHED: ['情感词', '长句', '主动'],
    FEARFUL_OBEDIENT: ['主动', '命令', '反问'],
    QUIET_FOND: ['夸张', '感叹号', '主动展开'],
    CALM_RATIONAL: ['情感词', '感叹号', '过度热情'],
  }
  return map[label] ?? []
}
