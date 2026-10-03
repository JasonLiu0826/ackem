/**
 * validate.ts — 角色卡校验
 * Canon 违禁词、性别↔预设一致、成人预设 18+、字段长度
 * 创建与编辑前必须经此模块
 */

import { getPreset, isPersonalityAdultGated } from '../../personalityPresets'
import type { AgentCard, CreateAgentInput, ParsedIntermediate, UpdateAgentInput } from './types'
import { CharacterCardError } from './types'

export type ValidationWarning = {
  code: 'PERSONA_TRUNCATED' | 'PERSONA_LONG'
  message: string
}

export type ValidationResult = {
  ok: true
  warnings: ValidationWarning[]
}

const PERSONA_SOFT_LIMIT = 12_000
const PERSONA_HARD_LIMIT = 20_000
const FIELD_MAX = 2000

const CANON_FORBIDDEN: RegExp[] = [
  /ACKEM-CANON/i,
  /Ackem\s*唯一\s*主体/i,
  /你是\s*Ackem/i,
  /你的名字是\s*Ackem/i,
  /本应用.*统一称为\s*Ackem/i,
  /buildAckemCanonBlock/i,
  /创造我的人叫\s*Jason/i,
  /不要自称\s*DeepSeek|GPT|Claude/i,
]

function scanCanonViolation(text: string): string | null {
  for (const re of CANON_FORBIDDEN) {
    if (re.test(text)) return `含违禁 Canon 类指令（${re.source}）`
  }
  return null
}

function assertLength(field: string, value: string, max = FIELD_MAX): void {
  if (value.length > max) {
    throw new CharacterCardError('VALIDATION_FAILED', `${field} 过长（>${max} 字）`)
  }
}

function collectTextBlob(parts: (string | undefined | string[])[]): string {
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : p ? [p] : []))
    .join('\n')
}

function checkPersonaLength(persona: string, warnings: ValidationWarning[]): string {
  if (persona.length > PERSONA_HARD_LIMIT) {
    throw new CharacterCardError('VALIDATION_FAILED', `人设正文过长（>${PERSONA_HARD_LIMIT} 字）`)
  }
  if (persona.length > PERSONA_SOFT_LIMIT) {
    warnings.push({
      code: 'PERSONA_LONG',
      message: `人设正文较长（${persona.length} 字），注入时将截断至 2500 字`,
    })
  }
  return persona
}

function assertPresetGender(presetId: string, gender: 'female' | 'male'): void {
  const preset = getPreset(presetId)
  if (!preset) {
    throw new CharacterCardError('VALIDATION_FAILED', `未知预设：${presetId}`)
  }
  if (preset.gender !== gender) {
    throw new CharacterCardError(
      'PRESET_MISMATCH',
      `预设「${preset.label}」与性别 ${gender} 不匹配`
    )
  }
}

function assertAdultPreset(presetId: string, ageConfirmed18: boolean): void {
  if (isPersonalityAdultGated(presetId) && !ageConfirmed18) {
    throw new CharacterCardError(
      'ADULT_NOT_CONFIRMED',
      '该预设须先在设置中确认年满 18 岁'
    )
  }
}

function assertPresetConfirmed(confirmed: boolean | undefined): void {
  if (!confirmed) {
    throw new CharacterCardError('PRESET_NOT_CONFIRMED', '须确认预设与人设气质匹配')
  }
}

function assertSocial3D(social3D?: { se: number; sp: number; so: number }): void {
  if (!social3D) return
  for (const [k, v] of Object.entries(social3D)) {
    if (v < 0 || v > 100) {
      throw new CharacterCardError('VALIDATION_FAILED', `social3D.${k} 须在 0–100`)
    }
  }
}

/** 创建前校验 */
export function validateCreateInput(
  input: CreateAgentInput,
  parsed: ParsedIntermediate,
  ageConfirmed18: boolean
): ValidationResult {
  const warnings: ValidationWarning[] = []

  if (!input.displayName?.trim()) {
    throw new CharacterCardError('VALIDATION_FAILED', '显示名不能为空')
  }
  if (!input.roleOrTagline?.trim() && !parsed.personaMarkdown?.trim()) {
    throw new CharacterCardError('VALIDATION_FAILED', '身份简述或人设正文至少填一项')
  }

  assertPresetConfirmed(input.presetMatchConfirmed === true)
  assertPresetGender(input.presetId, input.gender)
  assertAdultPreset(input.presetId, ageConfirmed18)
  assertSocial3D(input.social3D)

  assertLength('显示名', input.displayName.trim(), 80)
  assertLength('身份', input.roleOrTagline.trim(), 500)

  const canonHit = scanCanonViolation(
    collectTextBlob([
      parsed.displayName,
      parsed.roleOrTagline,
      parsed.personaMarkdown,
      parsed.formExtras?.speakingStyle,
      parsed.formExtras?.coreConflict,
      parsed.formExtras?.world,
      parsed.formExtras?.appearance,
      parsed.formExtras?.voiceSample,
      parsed.formExtras?.speechQuirks,
      parsed.formExtras?.prohibitions,
      input.seedMemories?.map((s) => s.content),
    ])
  )
  if (canonHit) {
    throw new CharacterCardError('VALIDATION_FAILED', canonHit)
  }

  checkPersonaLength(parsed.personaMarkdown, warnings)
  return { ok: true, warnings }
}

/** 编辑前校验（合并后的卡） */
export function validateUpdateInput(
  input: UpdateAgentInput,
  nextCard: AgentCard,
  ageConfirmed18: boolean
): ValidationResult {
  const warnings: ValidationWarning[] = []

  const presetId = input.personality?.presetId ?? nextCard.personality.presetId
  const presetChanging =
    input.personality?.presetId != null &&
    input.personality.presetId !== nextCard.personality.presetId

  if (presetChanging) {
    assertPresetConfirmed(input.personality?.presetMatchConfirmed === true)
  }

  assertPresetGender(presetId, nextCard.identity.gender)
  assertAdultPreset(presetId, ageConfirmed18)
  assertSocial3D(input.social3D ?? nextCard.social3D)

  if (input.personaMarkdown != null) {
    checkPersonaLength(input.personaMarkdown, warnings)
  }

  const canonHit = scanCanonViolation(
    collectTextBlob([
      nextCard.identity.name,
      nextCard.identity.role,
      nextCard.identity.tagline,
      nextCard.identity.world,
      nextCard.identity.appearance,
      nextCard.identity.voiceSample,
      nextCard.personality.coreConflict,
      nextCard.personality.speakingStyle,
      nextCard.personality.speechQuirks,
      nextCard.personality.prohibitions,
      input.personaMarkdown,
      input.seedMemories?.map((s) => s.content),
    ])
  )
  if (canonHit) {
    throw new CharacterCardError('VALIDATION_FAILED', canonHit)
  }

  return { ok: true, warnings }
}
