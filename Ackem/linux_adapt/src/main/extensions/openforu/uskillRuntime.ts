import type { SkillManifest } from '../skills/types'
import type { UskilConfig } from './loader'

/** 构建注入 LLM 的上下文块（Dispatch 执行后进入管家层→表达层） */
export function buildUskillContextInjection(manifest: SkillManifest, config: UskilConfig): string {
  const fromTemplate = config.promptTemplates?.contextInjection?.trim()
  if (fromTemplate) return fromTemplate

  const reply = config.onKeyword?.reply?.trim()
  if (reply) {
    return `【${manifest.name} 已触发】${reply}。用 Ackem 伴侣的自然语气回应，并落实该能力描述的行为。`
  }

  return ''
}

/** 用户可见的短反馈（toast / trace） */
export function buildUskillUserFacing(manifest: SkillManifest, config: UskilConfig): string {
  return (
    config.promptTemplates?.userFacing?.trim() ||
    config.onKeyword?.reply?.trim() ||
    `${manifest.name} 已触发`
  )
}

/** autonomous tick 到点时的 proactive 文案（不经 LLM / EmotionPanel） */
export function buildUskillProactiveMessage(manifest: SkillManifest, config: UskilConfig): string {
  const fromUserFacing = config.promptTemplates?.userFacing?.trim()
  if (fromUserFacing) return fromUserFacing

  const fromReply = config.onKeyword?.reply?.trim()
  if (fromReply) return fromReply

  const desc = manifest.description?.trim()
  if (desc) return desc

  return `${manifest.name} 提醒`
}

/** manifest + skill.json 是否启用 scheduler autonomous tick */
export function isUskillAutonomousEnabled(manifest: SkillManifest, config: UskilConfig): boolean {
  return manifest.dispatch?.mode === 'autonomous' && config.onProactive?.enabled === true
}
