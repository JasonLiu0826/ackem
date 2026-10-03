/**
 * Permission rule parse/match — Claude Code permissionRuleParser / shellRuleMatching spirit.
 * Format: "toolName" or "toolName(content)". Content supports exact, prefix (foo:*), wildcard (*).
 */

/** Map common CC / legacy names → Ackem tool names */
const TOOL_ALIASES: Record<string, string> = {
  Bash: 'bash',
  bash: 'bash',
  PowerShell: 'powershell',
  powershell: 'powershell',
  Read: 'read_file',
  read_file: 'read_file',
  Write: 'write_file',
  write_file: 'write_file',
  Edit: 'search_replace',
  search_replace: 'search_replace',
  Glob: 'glob',
  glob: 'glob',
  Grep: 'grep',
  grep: 'grep',
  WebFetch: 'web_fetch',
  web_fetch: 'web_fetch',
  WebSearch: 'web_search',
  web_search: 'web_search',
  OpenPath: 'open_path',
  open_path: 'open_path',
  OpenUrl: 'open_url',
  open_url: 'open_url',
  DocumentEdit: 'document_edit',
  document_edit: 'document_edit',
  DocumentConvert: 'document_convert',
  document_convert: 'document_convert',
  Agent: 'agent',
  agent: 'agent',
  TodoWrite: 'todo_write',
  todo_write: 'todo_write',
  TaskCreate: 'task_create',
  task_create: 'task_create',
  TaskGet: 'task_get',
  task_get: 'task_get',
  TaskUpdate: 'task_update',
  task_update: 'task_update',
  TaskList: 'task_list',
  task_list: 'task_list',
  Skill: 'invoke_skill',
  invoke_skill: 'invoke_skill',
  ListMcpResources: 'list_mcp_resources',
  ReadMcpResource: 'read_mcp_resource',
  NotebookEdit: 'notebook_edit',
  notebook_edit: 'notebook_edit',
  EnterWorktree: 'enter_worktree',
  enter_worktree: 'enter_worktree',
  ExitWorktree: 'exit_worktree',
  exit_worktree: 'exit_worktree',
  CronCreate: 'cron_create',
  cron_create: 'cron_create',
  CronDelete: 'cron_delete',
  cron_delete: 'cron_delete',
  CronList: 'cron_list',
  cron_list: 'cron_list',
  LSP: 'lsp',
  lsp: 'lsp'
}

export type PermissionRuleBehavior = 'allow' | 'deny' | 'ask'

export type ParsedPermissionRule = {
  toolName: string
  ruleContent?: string
  raw: string
}

export function normalizeToolName(name: string): string {
  const t = name.trim()
  if (TOOL_ALIASES[t]) return TOOL_ALIASES[t]!
  // mcp__* keep as-is (case sensitive server names already sanitized)
  if (t.startsWith('mcp__')) return t
  return t.toLowerCase()
}

function findFirstUnescaped(str: string, ch: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== ch) continue
    let bs = 0
    let j = i - 1
    while (j >= 0 && str[j] === '\\') {
      bs++
      j--
    }
    if (bs % 2 === 0) return i
  }
  return -1
}

function findLastUnescaped(str: string, ch: string): number {
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] !== ch) continue
    let bs = 0
    let j = i - 1
    while (j >= 0 && str[j] === '\\') {
      bs++
      j--
    }
    if (bs % 2 === 0) return i
  }
  return -1
}

export function unescapeRuleContent(content: string): string {
  return content
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}

export function escapeRuleContent(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

/** Parse "Bash(git status)" → { toolName, ruleContent } */
export function permissionRuleValueFromString(ruleString: string): ParsedPermissionRule {
  const raw = ruleString.trim()
  const open = findFirstUnescaped(raw, '(')
  if (open === -1) {
    return { toolName: normalizeToolName(raw), raw }
  }
  const close = findLastUnescaped(raw, ')')
  if (close === -1 || close <= open || close !== raw.length - 1) {
    return { toolName: normalizeToolName(raw), raw }
  }
  const toolPart = raw.slice(0, open)
  if (!toolPart) {
    return { toolName: normalizeToolName(raw), raw }
  }
  const content = unescapeRuleContent(raw.slice(open + 1, close))
  return {
    toolName: normalizeToolName(toolPart),
    ruleContent: content,
    raw
  }
}

export function permissionRuleValueToString(rule: {
  toolName: string
  ruleContent?: string
}): string {
  if (!rule.ruleContent) return rule.toolName
  return `${rule.toolName}(${escapeRuleContent(rule.ruleContent)})`
}

export function extractSubject(toolName: string, input: unknown): string {
  const obj =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  if (toolName === 'bash' || toolName === 'powershell') {
    return String(obj.command ?? '')
  }
  if (toolName === 'web_fetch' || toolName === 'open_url') return String(obj.url ?? '')
  if (toolName === 'web_search') return String(obj.query ?? '')
  if (toolName === 'open_path') return String(obj.path ?? '')
  if (toolName === 'document_edit' || toolName === 'document_convert') {
    return String(obj.path ?? '')
  }
  if (toolName === 'read_file' || toolName === 'write_file' || toolName === 'search_replace') {
    return String(obj.path ?? '')
  }
  if (toolName === 'glob') return String(obj.pattern ?? '')
  if (toolName === 'grep') return String(obj.pattern ?? '')
  try {
    return JSON.stringify(obj)
  } catch {
    return ''
  }
}

function matchContent(ruleContent: string, subject: string): boolean {
  const rule = ruleContent.trim()
  const sub = subject.trim()
  if (!rule) return true

  // CC ExitPlanMode allowedPrompts → bash(prompt: description)
  if (rule.toLowerCase().startsWith('prompt:')) {
    const desc = rule.slice('prompt:'.length).trim().toLowerCase()
    if (!desc) return true
    const subj = sub.toLowerCase()
    if (subj.includes(desc)) return true
    const words = desc.split(/\s+/).filter((w) => w.length > 2)
    if (words.length > 0 && words.every((w) => subj.includes(w))) return true
    return false
  }

  // Legacy prefix: "git:*"
  if (rule.endsWith(':*') && !rule.slice(0, -2).includes('*')) {
    const prefix = rule.slice(0, -2)
    return sub === prefix || sub.startsWith(prefix + ' ') || sub.startsWith(prefix)
  }

  // Simple wildcard * (escape regex meta, then * → .*)
  if (rule.includes('*')) {
    const escaped = rule
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
    try {
      return new RegExp(`^${escaped}$`, 'i').test(sub)
    } catch {
      return false
    }
  }

  // Exact (case-insensitive for shell commands)
  return sub === rule || sub.toLowerCase() === rule.toLowerCase()
}

export function ruleMatches(
  rule: ParsedPermissionRule,
  toolName: string,
  input: unknown
): boolean {
  const name = normalizeToolName(toolName)
  if (rule.toolName !== name && rule.toolName !== '*') {
    // Also allow matching mcp tools by exact qualified name
    if (!(name.startsWith('mcp__') && rule.toolName === name)) {
      return false
    }
  }
  if (rule.ruleContent == null || rule.ruleContent === '') return true
  const subject = extractSubject(name, input)
  if (matchContent(rule.ruleContent, subject)) return true
  // domain:<host> or bare hostname against web_fetch URL (M12)
  if (name === 'web_fetch') {
    try {
      const host = new URL(subject).hostname.toLowerCase()
      const rc = rule.ruleContent.trim().toLowerCase()
      if (rc === host || rc === `domain:${host}`) return true
      if (rc.startsWith('domain:') && matchContent(rc.slice('domain:'.length), host)) {
        return true
      }
    } catch {
      /* ignore */
    }
  }
  return false
}

export type PermissionRulesConfig = {
  allow: string[]
  deny: string[]
  ask: string[]
}

export const EMPTY_PERMISSION_RULES: PermissionRulesConfig = {
  allow: [],
  deny: [],
  ask: []
}

export function normalizePermissionRules(raw: unknown): PermissionRulesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_PERMISSION_RULES }
  }
  const o = raw as Record<string, unknown>
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
  return {
    allow: list(o.allow),
    deny: list(o.deny),
    ask: list(o.ask)
  }
}

export function findMatchingRule(
  rules: string[],
  toolName: string,
  input: unknown
): ParsedPermissionRule | null {
  for (const r of rules) {
    const parsed = permissionRuleValueFromString(r)
    if (ruleMatches(parsed, toolName, input)) return parsed
  }
  return null
}

/** Build a persistable allow rule from a concrete tool call (exact content when useful). */
export function buildAlwaysAllowRule(toolName: string, input?: unknown): string {
  const name = normalizeToolName(toolName)
  const subject = extractSubject(name, input ?? {}).trim()
  if (
    subject &&
    (name === 'bash' ||
      name === 'powershell' ||
      name === 'web_fetch' ||
      name === 'read_file' ||
      name === 'write_file' ||
      name === 'search_replace')
  ) {
    return permissionRuleValueToString({ toolName: name, ruleContent: subject })
  }
  return name
}
