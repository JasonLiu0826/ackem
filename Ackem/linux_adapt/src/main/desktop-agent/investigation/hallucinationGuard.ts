import type {
  DocumentsFindingsReport,
  GamesFindingsReport,
  InvestigationReport
} from '../../../shared/investigation'

const VAGUE_PHRASES = [
  '自己打开看看',
  '里面没扫',
  'steam 里面具体',
  '没帮你扫',
  '不太清楚里面'
]

/** 检测最终回复是否含敷衍句或与 findings 严重不符 */
export function validateSynthesisAgainstFindings(
  reply: string,
  report: InvestigationReport
): { ok: boolean; issues: string[] } {
  const issues: string[] = []

  for (const phrase of VAGUE_PHRASES) {
    if (reply.includes(phrase)) {
      issues.push(`vague_phrase:${phrase}`)
    }
  }

  if (report.template === 'games') {
    return validateGamesReply(reply, report, issues)
  }
  return validateDocumentsReply(reply, report, issues)
}

function validateGamesReply(
  reply: string,
  report: GamesFindingsReport,
  issues: string[]
): { ok: boolean; issues: string[] } {
  const hasSteamGames = report.games.some((g) => g.source === 'steam_common')
  if (hasSteamGames && /steam.*(没|未).*扫/i.test(reply)) {
    issues.push('contradicts_steam_findings')
  }

  const bulletLines = reply.split('\n').filter((l) => /^[\-*•\d.]/.test(l.trim()))
  if (report.games.length >= 3 && bulletLines.length > 0 && bulletLines.length < report.games.length * 0.5) {
    issues.push('list_shorter_than_findings')
  }

  if (report.games.length === 0 && /(帝国时代|bannerlord|steam|epic)/i.test(reply)) {
    issues.push('possible_hallucination_with_empty_findings')
  }

  return { ok: issues.length === 0, issues }
}

function validateDocumentsReply(
  reply: string,
  report: DocumentsFindingsReport,
  issues: string[]
): { ok: boolean; issues: string[] } {
  const bulletLines = reply.split('\n').filter((l) => /^[\-*•\d.]/.test(l.trim()))
  if (report.files.length >= 3 && bulletLines.length > 0 && bulletLines.length < report.files.length * 0.5) {
    issues.push('list_shorter_than_findings')
  }
  if (report.files.length === 0 && /\.(pdf|docx)/i.test(reply)) {
    issues.push('possible_hallucination_with_empty_findings')
  }
  return { ok: issues.length === 0, issues }
}

export function formatFindingsFallbackReply(report: InvestigationReport, userQuery: string): string {
  if (report.template === 'games') {
    return formatGamesFallback(report, userQuery)
  }
  return formatDocumentsFallback(report, userQuery)
}

function formatGamesFallback(report: GamesFindingsReport, userQuery: string): string {
  const lines: string[] = []
  lines.push(`关于「${userQuery}」，我已完成本机查找，共找到 **${report.stats.total}** 款游戏/相关安装：`)
  lines.push('')
  for (const g of report.games) {
    lines.push(`- **${g.displayName}**`)
    lines.push(`  - 路径：\`${g.path}\``)
    lines.push(`  - 来源：${g.source}`)
  }
  appendNotScanned(lines, report.notScanned)
  return lines.join('\n')
}

function formatDocumentsFallback(report: DocumentsFindingsReport, userQuery: string): string {
  const extHint = report.extensions.join(', ')
  const lines: string[] = []
  lines.push(
    `关于「${userQuery}」，我已在桌面、文档、下载文件夹中搜索（${extHint}），共找到 **${report.stats.total}** 个文件：`
  )
  lines.push('')
  for (const f of report.files) {
    lines.push(`- **${f.displayName}**`)
    lines.push(`  - 路径：\`${f.path}\``)
  }
  appendNotScanned(lines, report.notScanned)
  return lines.join('\n')
}

function appendNotScanned(
  lines: string[],
  notScanned: Array<{ checklistId: string; reason: string; path: string | null }>
): void {
  if (notScanned.length === 0) return
  lines.push('')
  lines.push('**未能扫描的位置：**')
  for (const n of notScanned) {
    lines.push(`- ${n.checklistId}：${n.reason}${n.path ? `（${n.path}）` : ''}`)
  }
}
