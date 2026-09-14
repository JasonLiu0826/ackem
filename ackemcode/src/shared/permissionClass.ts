/** Operation class for session "allow this type" (not a language/IDE concept). */

const PLAYWRIGHT_EDGE_SERVER = 'playwright-edge'

function parseMcp(qualified: string): { server: string; tool: string } | null {
  if (!qualified.startsWith('mcp__')) return null
  const rest = qualified.slice('mcp__'.length)
  const idx = rest.indexOf('__')
  if (idx <= 0) return null
  return { server: rest.slice(0, idx), tool: rest.slice(idx + 2) }
}

export function permissionClass(toolName: string): string {
  const name = toolName.trim()
  const mcp = parseMcp(name)
  if (mcp) {
    if (mcp.server === PLAYWRIGHT_EDGE_SERVER) return 'browser'
    return `mcp:${mcp.server}`
  }
  const n = name.toLowerCase()
  if (n === 'document_edit' || n === 'document_convert') return 'document'
  if (n === 'web_search' || n === 'web_fetch') return 'web'
  if (
    n === 'write_file' ||
    n === 'search_replace' ||
    n === 'notebook_edit'
  ) {
    return 'files'
  }
  if (n === 'bash' || n === 'powershell' || n === 'verify_delivery') return 'shell'
  if (n === 'enter_worktree' || n === 'exit_worktree') return 'worktree'
  if (n.startsWith('cron_')) return 'cron'
  if (n === 'manage_mcp') return 'mcp-admin'
  if (n === 'invoke_skill' || n === 'install_skill' || n === 'uninstall_skill') {
    return 'skill'
  }
  return n || 'tool'
}

export function permissionClassKey(toolName: string): string {
  return `class:${permissionClass(toolName)}`
}

export function permissionClassLabel(toolName: string): { zh: string; en: string } {
  const cls = permissionClass(toolName)
  const labels: Record<string, { zh: string; en: string }> = {
    browser: { zh: '浏览器', en: 'browser' },
    document: { zh: '文档', en: 'documents' },
    web: { zh: '网页检索', en: 'web' },
    files: { zh: '改文件', en: 'files' },
    shell: { zh: '终端', en: 'shell' },
    worktree: { zh: '工作树', en: 'worktree' },
    cron: { zh: '定时任务', en: 'cron' },
    'mcp-admin': { zh: 'MCP 管理', en: 'MCP admin' },
    skill: { zh: '技能', en: 'skills' }
  }
  if (labels[cls]) return labels[cls]!
  if (cls.startsWith('mcp:')) {
    const server = cls.slice(4)
    return { zh: `MCP ${server}`, en: `MCP ${server}` }
  }
  return { zh: cls, en: cls }
}

/** Destructive / delete-shaped ops — still ask under window allow. */
export function isDeleteOperation(toolName: string, input?: unknown): boolean {
  const name = toolName.trim().toLowerCase()
  if (name === 'cron_delete' || name === 'uninstall_skill') return true
  if (name !== 'bash' && name !== 'powershell') return false
  const obj =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {}
  const cmd = String(obj.command ?? '')
  if (!cmd.trim()) return false
  return (
    /\b(rm|rmdir|rd|del|erase|unlink|Remove-Item|\bri\b)\b/i.test(cmd) ||
    /\bgit\s+(clean|branch\s+-[dD])\b/i.test(cmd) ||
    /\bkubectl\s+delete\b/i.test(cmd) ||
    /\bfind\b[\s\S]*-delete\b/i.test(cmd)
  )
}
