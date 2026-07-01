import type { ToolResultForFollowUp } from '../toolFollowUp'

const USE_COMPUTER = 'use_computer'

export function formatUseComputerListDelivery(
  toolResults: ToolResultForFollowUp[]
): string | null {
  const dirs = new Set<string>()
  const files = new Set<string>()
  for (const tr of toolResults) {
    if (tr.name !== USE_COMPUTER) continue
    for (const m of tr.content.matchAll(/^\[DIR\]\s+(.+)$/gm)) dirs.add(m[1].trim())
    for (const m of tr.content.matchAll(/^\[FILE\]\s+(.+)$/gm)) files.add(m[1].trim())
  }
  if (dirs.size === 0 && files.size === 0) return null
  const lines: string[] = []
  if (dirs.size > 0) {
    lines.push('**文件夹**', ...[...dirs].map((d) => `- ${d}`))
  }
  if (files.size > 0) {
    lines.push('**文件**', ...[...files].map((f) => `- ${f}`))
  }
  return lines.join('\n')
}

function listEntryNames(formatted: string): string[] {
  return [...formatted.matchAll(/^- (.+)$/gm)].map((m) => m[1].trim())
}

function extractMarkdownListLines(text: string): string[] {
  return [...text.matchAll(/^[-*•]\s*(.+)$/gm)].map((m) => m[1].trim())
}

function countListLineMatches(listLines: string[], names: string[]): number {
  return names.filter((n) =>
    listLines.some((line) => line === n || line.includes(n) || n.includes(line))
  ).length
}

/** LLM 是否已用 Markdown 列表写出目录/文件 */
export function llmHasSubstantiveDirectoryList(
  llmText: string,
  toolResults: ToolResultForFollowUp[]
): boolean {
  const formatted = formatUseComputerListDelivery(toolResults)
  if (!formatted) return false
  const names = listEntryNames(formatted)
  if (names.length === 0) return false
  if (/^\*\*文件夹\*\*/m.test(llmText) || /^\*\*文件\*\*/m.test(llmText)) return true
  const listLines = extractMarkdownListLines(llmText)
  if (listLines.length === 0) return false
  const required = names.length <= 3 ? names.length : Math.max(3, Math.ceil(names.length * 0.5))
  return (
    listLines.length >= required ||
    countListLineMatches(listLines, names) >= required
  )
}

/** LLM 交付是否已覆盖工具结果中的条目名 */
export function desktopAgentDeliveryCoversToolResults(
  llmText: string,
  toolResults: ToolResultForFollowUp[]
): boolean {
  const formatted = formatUseComputerListDelivery(toolResults)
  if (!formatted) return true
  const names = listEntryNames(formatted)
  if (names.length === 0) return true
  const mentioned = names.filter((n) => llmText.includes(n)).length
  const threshold = names.length <= 3 ? names.length : Math.max(3, Math.ceil(names.length * 0.6))
  return mentioned >= threshold
}

function stripDuplicateListSections(llmText: string, names: string[]): string {
  let text = llmText
    .replace(/^\*\*文件夹\*\*\n(?:(?:- .+\n?)+)/m, '')
    .replace(/^\*\*文件\*\*\n(?:(?:- .+\n?)+)/m, '')
    .trim()

  const lines = text.split('\n')
  let start = 0
  while (start < lines.length && /^[-*•]\s/.test(lines[start])) {
    const item = lines[start].replace(/^[-*•]\s*/, '').trim()
    if (names.some((n) => item === n || item.includes(n) || n.includes(item))) {
      start++
      continue
    }
    break
  }
  return lines.slice(start).join('\n').trim() || text
}

/** 若 LLM 回复未列出真实目录内容，把工具结果结构化补在前面 */
export function mergeDesktopAgentDelivery(
  llmText: string,
  toolResults: ToolResultForFollowUp[]
): string {
  const trimmed = llmText.trim()
  const formatted = formatUseComputerListDelivery(toolResults)
  if (!formatted) return trimmed
  if (
    trimmed &&
    (desktopAgentDeliveryCoversToolResults(trimmed, toolResults) ||
      llmHasSubstantiveDirectoryList(trimmed, toolResults))
  ) {
    return trimmed
  }
  if (!trimmed) return formatted
  const names = listEntryNames(formatted)
  const cleaned = stripDuplicateListSections(trimmed, names)
  return cleaned ? `${formatted}\n\n${cleaned}` : formatted
}

export function buildDesktopAgentFollowUpSuffix(toolResults: ToolResultForFollowUp[]): string {
  const hasList = toolResults.some(
    (tr) => tr.name === USE_COMPUTER && /^\[(DIR|FILE)\]/m.test(tr.content)
  )
  if (!hasList) {
    return [
      '【电脑助手交付 · 硬性】',
      '- 必须基于上方「电脑助手结果」中的真实路径/内容回答；',
      '- 禁止编造未出现在工具结果中的文件或操作。'
    ].join('\n')
  }
  return [
    '【电脑助手交付 · 硬性】',
    '- 上方「电脑助手结果」是 list_folder / search_files 的真实输出；',
    '- 用户要求列出/查看时：**必须先**用 Markdown 列表写出全部文件夹与文件（每行一条）；',
    '- 人格化点评只能放在列表**之后**，且不超过 2 句；',
    '- 禁止只提一两个名字却不列出完整结果（除非工具结果已注明截断）。'
  ].join('\n')
}

/** 多轮工具调用时合并 use_computer 结果，保留条目最全的一份 */
export function mergeToolResultsForDelivery(
  toolResults: ToolResultForFollowUp[]
): ToolResultForFollowUp[] {
  const withoutMemory = toolResults.filter((tr) => tr.name !== 'append_memory')
  const computer = withoutMemory.filter((tr) => tr.name === USE_COMPUTER)
  if (computer.length <= 1) return withoutMemory
  const score = (content: string) =>
    (content.match(/^\[(DIR|FILE)\]/gm) ?? []).length
  const best = computer.reduce((a, b) => (score(a.content) >= score(b.content) ? a : b))
  return [...withoutMemory.filter((tr) => tr.name !== USE_COMPUTER), best]
}
