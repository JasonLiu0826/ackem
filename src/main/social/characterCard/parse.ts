/**
 * parse.ts — 角色卡文本解析
 * 将表单 / md / txt 转为中间结构，供 validate 与 build 使用
 * 平台 zip 本期拒绝，返回明确错误
 */

import type { CreateAgentInput, ParsedIntermediate } from './types'
import { CharacterCardError } from './types'

const ZIP_REJECT_MSG = '平台角色卡导入尚未开放'

/** 拒绝 zip 格式（本期 stub，无真实解析） */
export function rejectZipFormat(): never {
  throw new CharacterCardError('PLATFORM_ZIP_NOT_OPEN', ZIP_REJECT_MSG)
}

export function parseRawFormat(
  format: 'form' | 'md' | 'txt' | 'zip',
  content?: string
): 'local-form' | 'local-md' | 'local-txt' {
  if (format === 'zip') rejectZipFormat()
  if (format === 'form') return 'local-form'
  if (format === 'md') return 'local-md'
  return 'local-txt'
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function extractMdTitle(text: string): string | null {
  const m = text.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : null
}

function extractMdRole(text: string): string | null {
  const m = text.match(/^##\s*身份\s*\n+([\s\S]*?)(?=\n##|\n#|$)/m)
  if (!m) return null
  const line = m[1].trim().split('\n')[0]?.trim()
  return line || null
}

function parseFileContent(
  format: 'md' | 'txt',
  content: string,
  fallbackName: string,
  fallbackRole: string
): { displayName: string; roleOrTagline: string; personaMarkdown: string } {
  const text = stripBom(content.trim())
  if (!text) {
    throw new CharacterCardError('VALIDATION_FAILED', '文件内容为空')
  }
  if (format === 'txt') {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    const displayName = lines[0] || fallbackName
    const roleOrTagline = lines[1] || fallbackRole
    const personaMarkdown = text
    return { displayName, roleOrTagline, personaMarkdown }
  }
  const displayName = extractMdTitle(text) || fallbackName
  const roleOrTagline = extractMdRole(text) || fallbackRole
  return { displayName, roleOrTagline, personaMarkdown: text }
}

/** 将 CreateAgentInput 解析为中间结构 */
export function parseToIntermediate(input: CreateAgentInput): ParsedIntermediate {
  const sourceFormat = parseRawFormat(input.format)

  if (input.format === 'form') {
    const personaMarkdown =
      input.personaMarkdown?.trim() ||
      buildMinimalPersonaFromForm(input)
    return {
      displayName: input.displayName.trim(),
      gender: input.gender,
      roleOrTagline: input.roleOrTagline.trim(),
      personaMarkdown,
      formExtras: input.formExtras,
      sourceFormat,
    }
  }

  const content = input.personaMarkdown?.trim()
  if (!content) {
    throw new CharacterCardError('VALIDATION_FAILED', 'md/txt 导入须提供文件内容')
  }

  const parsed = parseFileContent(
    input.format,
    content,
    input.displayName.trim(),
    input.roleOrTagline.trim()
  )

  return {
    displayName: parsed.displayName || input.displayName.trim(),
    gender: input.gender,
    roleOrTagline: parsed.roleOrTagline || input.roleOrTagline.trim(),
    personaMarkdown: parsed.personaMarkdown,
    formExtras: input.formExtras,
    sourceFormat,
  }
}

/** IPC 预览：解析 md/txt 文件文本（zip 直接拒绝） */
export function parseFilePreview(
  format: 'md' | 'txt' | 'zip',
  content: string,
  opts?: { displayName?: string; roleOrTagline?: string; gender?: 'female' | 'male' }
): ParsedIntermediate {
  if (format === 'zip') rejectZipFormat()
  const fileFormat = format as 'md' | 'txt'
  const parsed = parseFileContent(
    fileFormat,
    content,
    opts?.displayName?.trim() || '未命名角色',
    opts?.roleOrTagline?.trim() || ''
  )
  return {
    displayName: parsed.displayName,
    gender: opts?.gender ?? 'female',
    roleOrTagline: parsed.roleOrTagline,
    personaMarkdown: parsed.personaMarkdown,
    sourceFormat: fileFormat === 'md' ? 'local-md' : 'local-txt',
  }
}

function buildMinimalPersonaFromForm(input: CreateAgentInput): string {
  const lines: string[] = [`# ${input.displayName.trim()}`, '', '## 身份', input.roleOrTagline.trim()]
  if (input.formExtras?.world) {
    lines.push('', `世界：${input.formExtras.world}`)
  }
  if (input.formExtras?.appearance) {
    lines.push('', `外貌：${input.formExtras.appearance}`)
  }
  if (input.formExtras?.speakingStyle) {
    lines.push('', '## 说话方式', input.formExtras.speakingStyle)
  }
  if (input.formExtras?.coreConflict) {
    lines.push('', '## 性格', input.formExtras.coreConflict)
  }
  return lines.join('\n')
}
