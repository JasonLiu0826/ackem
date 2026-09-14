/** Human-facing permission prompt copy (CLI / web). */

function clip(text: string, max = 180): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function subjectFromInput(toolName: string, input: unknown): string {
  const obj =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  const n = toolName.toLowerCase()
  if (n === 'bash' || n === 'powershell') return String(obj.command ?? '')
  if (n === 'web_fetch') return String(obj.url ?? '')
  if (n === 'web_search') return String(obj.query ?? '')
  if (n === 'read_file' || n === 'write_file' || n === 'search_replace') {
    return String(obj.path ?? obj.file_path ?? obj.filePath ?? '')
  }
  if (n === 'glob' || n === 'grep') return String(obj.pattern ?? '')
  if (typeof obj.path === 'string') return obj.path
  if (typeof obj.url === 'string') return obj.url
  return ''
}

export function summarizePermissionOperation(
  toolName: string,
  input: unknown
): { zh: string; en: string } {
  const n = toolName.trim() || 'tool'
  const subject = clip(subjectFromInput(n, input))
  const kind = n.toLowerCase()
  if (kind === 'bash' || kind === 'powershell') {
    return {
      zh: subject ? `将执行 ${n} 命令：${subject}` : `将运行 ${n}`,
      en: subject ? `Will run ${n}: ${subject}` : `Will run ${n}`
    }
  }
  if (kind === 'write_file' || kind === 'search_replace' || kind === 'notebook_edit') {
    return {
      zh: subject ? `将修改文件：${subject}` : `将修改项目文件`,
      en: subject ? `Will edit ${subject}` : `Will edit a project file`
    }
  }
  if (kind === 'web_fetch') {
    return {
      zh: subject ? `将访问网络：${subject}` : `将发起网络请求`,
      en: subject ? `Will fetch ${subject}` : `Will make a network request`
    }
  }
  if (kind === 'web_search') {
    return {
      zh: subject ? `将搜索：${subject}` : `将发起网络搜索`,
      en: subject ? `Will search: ${subject}` : `Will search the web`
    }
  }
  if (kind === 'agent') {
    return {
      zh: subject ? `将派遣子代理：${clip(subject, 80)}` : `将派遣子代理`,
      en: subject ? `Will launch a sub-agent: ${clip(subject, 80)}` : `Will launch a sub-agent`
    }
  }
  return {
    zh: subject ? `${n} 将作用于：${subject}` : `将调用工具 ${n}`,
    en: subject ? `${n} will use: ${subject}` : `Will call ${n}`
  }
}

export function explainPermissionAsk(
  reason: string,
  toolName: string
): { zh: string; en: string } {
  const r = reason.trim()
  const high = /high risk/i.test(r) || r.includes('高风险')
  const crit = /critical/i.test(r)
  const detail = r
    .replace(/^High risk:\s*/i, '')
    .replace(/^Critical(?: risk)?:\s*/i, '')
    .trim()
  if (high) {
    return {
      zh: `请求确认的原因：该操作被判定为高风险（${detail || r}），可能造成不可逆影响。AckemCode 需要你确认后才会执行。`,
      en: `Why this prompt: high-risk action (${detail || r}). AckemCode will not run it until you confirm.`
    }
  }
  if (crit) {
    return {
      zh: `请求确认的原因：该操作被判定为危急（${detail || r}）。`,
      en: `Why this prompt: critical-risk action (${detail || r}).`
    }
  }
  if (/Ask required by rule/i.test(r) || r.includes('规则')) {
    return {
      zh: `请求确认的原因：权限规则要求对此类操作询问。${r}`,
      en: `Why this prompt: a permission rule requires asking. ${r}`
    }
  }
  return {
    zh: `请求确认的原因：${toolName} 属于敏感操作，AckemCode 不会在未确认时执行。${r ? `（${r}）` : ''}`,
    en: `Why this prompt: ${toolName} is a sensitive action and needs confirmation.${r ? ` (${r})` : ''}`
  }
}
