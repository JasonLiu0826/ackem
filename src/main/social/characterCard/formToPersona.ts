/**
 * formToPersona.ts — 表单 → persona.md
 * 将向导表单字段合成为长文人设，与文件导入走同一 Tier A 管线
 */

import type { CreateAgentInput } from './types'

export function formToPersona(input: Pick<
  CreateAgentInput,
  'displayName' | 'roleOrTagline' | 'formExtras' | 'personaMarkdown'
>): string {
  if (input.personaMarkdown?.trim()) {
    return input.personaMarkdown.trim()
  }

  const name = input.displayName.trim()
  const role = input.roleOrTagline.trim()
  const ex = input.formExtras
  const lines: string[] = [`# ${name}`, '', '## 身份', role]

  if (ex?.world) {
    lines.push('', ex.world.trim())
  }
  if (ex?.appearance) {
    lines.push('', `外貌：${ex.appearance.trim()}`)
  }

  if (ex?.coreConflict) {
    lines.push('', '## 性格', ex.coreConflict.trim())
  }

  if (ex?.speakingStyle) {
    lines.push('', '## 说话方式', ex.speakingStyle.trim())
  }

  if (ex?.speechQuirks?.length) {
    lines.push('', '## 口癖')
    for (const q of ex.speechQuirks) {
      if (q.trim()) lines.push(`- ${q.trim()}`)
    }
  }

  if (ex?.prohibitions?.length) {
    lines.push('', '## 禁忌')
    for (const p of ex.prohibitions) {
      if (p.trim()) lines.push(`- ${p.trim()}`)
    }
  }

  if (ex?.voiceSample) {
    lines.push('', '## 台词示例', ex.voiceSample.trim())
  }

  return lines.join('\n')
}
