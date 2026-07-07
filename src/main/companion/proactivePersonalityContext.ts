import { getPreset, buildPresetVoiceGuide } from '../personalityPresets'
import { getPersonalityTemplate } from '../prompt/personality'
import {
  buildPersonalitySection,
  buildProhibitionSection,
  buildExampleSection,
  selectExamples
} from '../prompt/emotion-fusion'
import type { AppSettings } from '../settings'
import { COMPANION_HARASS_DELAY_MS } from '../extensions/plugins/builtin/desktop-companion/companionHarass'

export type ProactiveMessageKind =
  | 'check_in'
  | 'memory_echo'
  | 'time_greet'
  | 'miss_you'
  | 'playful_nudge'
  | 'photo_share'

/** 注入 LLM 的 v3 人格块（29 预设通用） */
export function buildProactivePersonalityBlock(args: {
  presetId: string
  settings: AppSettings
  aff: number
  harass?: boolean
}): string {
  const preset = getPreset(args.presetId)
  const template = getPersonalityTemplate(args.presetId)
  const adultOn = !!args.settings.adultContentMode && !!args.settings.ageConfirmed18
  const voiceGuide = preset ? buildPresetVoiceGuide(preset, adultOn) : ''

  const lines = [
    buildPersonalitySection(template),
    voiceGuide ? `【口吻演绎】${voiceGuide}` : '',
    buildProhibitionSection(template.人格专属禁止.slice(0, 6)),
    buildExampleSection(selectExamples(template, args.aff, 3)),
    `【主动消息】用户暂时没回，你要主动发一条短消息。必须像「${template.label}」本人说话，禁止通用温柔助手/客服腔。`
  ]

  if (args.harass) {
    const I = preset?.I ?? 50
    lines.push(
      `【骚扰模式】可以更黏、更追问，但表达方式仍须符合「${template.label}」：` +
        (I < 35
          ? '低主动人格也要用极短、克制的方式表达在意，不要突然变话痨撒娇。'
          : I >= 70
            ? '高主动人格可以更直接地黏人、调侃或表达想念。'
            : '按人设自然程度主动，不要脱离语癖与说话方式。')
    )
  }

  return lines.filter(Boolean).join('\n')
}

/** 从 v3 示例句选取人格化 fallback */
export function pickPersonalityProactiveFallback(
  presetId: string,
  aff: number,
  harass: boolean,
  rng: () => number = Math.random
): string {
  const template = getPersonalityTemplate(presetId)
  const effectiveAff = harass ? Math.max(aff, 55) : aff
  const examples = selectExamples(template, effectiveAff, 6)
  if (examples.length > 0) {
    return examples[Math.floor(rng() * examples.length)] ?? examples[0]!
  }
  return template.示例['中亲密'][0] ?? '在吗？'
}

/** 低主动(I)人格在骚扰 tick 时概率跳过，避免三无/冰山高频黏人 */
export function shouldHarassTickForPersonality(
  presetId: string,
  rng: () => number = Math.random
): boolean {
  const I = getPreset(presetId)?.I ?? 50
  if (I >= 70) return true
  if (I >= 50) return rng() < 0.85
  if (I >= 30) return rng() < 0.55
  return rng() < 0.25
}

/** 低主动人格骚扰间隔偏向更长 */
export function pickPersonalityHarassDelayMs(
  presetId: string,
  rng: () => number = Math.random
): number {
  const I = getPreset(presetId)?.I ?? 50
  const weights =
    I >= 70
      ? [0.35, 0.3, 0.2, 0.15]
      : I >= 50
        ? [0.25, 0.3, 0.25, 0.2]
        : I >= 30
          ? [0.15, 0.25, 0.3, 0.3]
          : [0.1, 0.15, 0.3, 0.45]

  const r = rng()
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!
    if (r < acc) return COMPANION_HARASS_DELAY_MS[i] ?? COMPANION_HARASS_DELAY_MS[0]!
  }
  return COMPANION_HARASS_DELAY_MS[COMPANION_HARASS_DELAY_MS.length - 1]!
}

export function pickCompanionProactiveKind(args: {
  fact: string | null
  aff: number
  stage: string
  harass?: boolean
  presetId: string
}): ProactiveMessageKind {
  const I = getPreset(args.presetId)?.I ?? 50

  if (args.harass) {
    const pool: ProactiveMessageKind[] = []
    if (I >= 70) {
      pool.push('playful_nudge', 'playful_nudge', 'miss_you', 'miss_you')
    } else if (I >= 40) {
      pool.push('playful_nudge', 'miss_you', 'check_in')
    } else {
      pool.push('check_in', 'memory_echo')
      if (I >= 25) pool.push('playful_nudge')
    }
    if (args.fact) pool.push('memory_echo')
    if (args.aff > 20 && args.stage !== 'STRANGER' && I >= 35) pool.push('miss_you')
    return pool[Math.floor(Math.random() * pool.length)] ?? 'check_in'
  }

  const pool: ProactiveMessageKind[] =
    I >= 60
      ? ['check_in', 'time_greet', 'playful_nudge', 'playful_nudge']
      : I >= 35
        ? ['check_in', 'time_greet', 'playful_nudge']
        : ['check_in', 'memory_echo', 'time_greet']
  if (args.fact) pool.push('memory_echo', 'memory_echo')
  if (args.aff > 25 && args.stage !== 'STRANGER' && I >= 40) pool.push('miss_you', 'miss_you')
  // 偶尔主动分享照片（低概率，需要生图耗时）
  if (Math.random() < 0.15) pool.push('photo_share')
  return pool[Math.floor(Math.random() * pool.length)] ?? 'check_in'
}
