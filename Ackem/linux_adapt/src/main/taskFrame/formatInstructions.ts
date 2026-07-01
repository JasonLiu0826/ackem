// [taskFrame/formatInstructions] — 将 UserTaskFrame 转为各层可注入的 prompt 块

import {
  buildFormatHintFromDelivery,
  isStructuredDelivery,
  type UserTaskFrame
} from '../../shared/taskFrame'

/** 注入 assembleMessages systemHint：结构化交付时 override「一句对白」约束 */
export function buildTaskFrameSystemHint(frame: UserTaskFrame | undefined): string {
  if (!frame || !isStructuredDelivery(frame)) return ''

  const formatHint =
    frame.formatHint ?? buildFormatHintFromDelivery(frame.delivery, frame.goal) ?? ''

  const lines = [
    '【用户交付要求 · Task Frame】',
    `- 目标：${frame.goal}`,
    `- 形态：${frame.delivery}`,
    formatHint
  ]

  if (frame.subjects.length > 0) {
    lines.push(`- 涉及对象：${frame.subjects.join('、')}`)
  }

  lines.push(
    '本轮须在纸面卡或主答复中满足上述形态；伴侣气泡可短，但不得否定或省略用户要求的结构（禁止说「没有表格」等）。',
    '【诚实护栏 · 硬性】用户已要求表格/列表时：禁止仅用傲娇散文敷衍；禁止假称「已经列好了」却不输出 Markdown 结构；必须在正文交付真实表格/列表，或明确说明尚未生成。'
  )

  return lines.filter(Boolean).join('\n')
}

/** 检索摘录正文 synthesis 追加指令 */
export function buildCardBodyFormatBlock(frame: UserTaskFrame | undefined): string {
  if (!frame || frame.delivery === 'prose') return ''

  const hint =
    frame.formatHint ?? buildFormatHintFromDelivery(frame.delivery, frame.goal) ?? ''

  if (frame.delivery === 'markdown_table') {
    return (
      `\n\n【交付形态 · 硬性】${hint}\n` +
      '- 正文**必须**以 Markdown 表格呈现（| 列 | 列 | 形式，含表头分隔行）\n' +
      '- 至少 4 行数据（不含表头）；对比任务按用户对象组织列或行\n' +
      '- 用户拿 Ackem（你）与其他产品对比时，Ackem 必须在表头/第一列，**禁止**用 DeepSeek/GPT/Claude 等模型名代替 Ackem\n' +
      '- **禁止**用散文段落代替表格；可在表格前写 1～2 句概述\n' +
      (frame.subjects.length >= 2
        ? `- 须覆盖这些对象：${frame.subjects.join('、')}\n`
        : '')
    )
  }

  if (frame.delivery === 'bullet_list') {
    return (
      `\n\n【交付形态 · 硬性】${hint}\n` +
      '- 正文核心须为 Markdown 无序列表（每行以 - 开头）\n' +
      '- 至少 4 条；禁止用长段落代替列表\n'
    )
  }

  return ''
}

/** 伴侣短评 synthesis：结构化交付时的气泡策略 */
export function buildCompanionReplyFormatBlock(frame: UserTaskFrame | undefined): string {
  if (!frame || frame.delivery === 'prose') return ''

  return (
    '\n\n【气泡策略】用户要求的表格/列表已在纸面卡正文完成。\n' +
    '- 你只需 **1 句话**（≤60 字）用第一人称收尾，像刚帮用户查完/写完\n' +
    '- **禁止**说「没有表格/列表」；**禁止**复述表格内容；**禁止**评委式点评纸面卡质量\n'
  )
}

/** toolFollowUp 第二轮任务说明 */
export function buildToolFollowUpFormatBlock(frame: UserTaskFrame | undefined): string {
  if (!frame || frame.delivery === 'prose') {
    return '- 用清晰的中文条目写出要点（例如新特性、版本变化等）；'
  }

  if (frame.delivery === 'markdown_table') {
    return '- 用 Markdown **表格**直接回答（含表头与多行），禁止散文敷衍；'
  }

  return '- 用 Markdown **无序列表**分条回答，每条一行；'
}
