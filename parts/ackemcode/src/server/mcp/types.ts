import type { ToolDefinition } from '../../shared/types.js'

/** Claude Code–style MCP config (stdio | http | sse) */
export type McpServerConfig =
  | {
      type?: 'stdio'
      command: string
      args?: string[]
      env?: Record<string, string>
      disabled?: boolean
    }
  | {
      type: 'http' | 'sse'
      url: string
      headers?: Record<string, string>
      disabled?: boolean
    }

export type McpServersMap = Record<string, McpServerConfig>

/** Sanitize server/tool names for OpenAI function names */
export function sanitizeMcpName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'unnamed'
}

export function mcpToolName(server: string, tool: string): string {
  return `mcp__${sanitizeMcpName(server)}__${sanitizeMcpName(tool)}`
}

export function parseMcpToolName(
  qualified: string
): { server: string; tool: string } | null {
  if (!qualified.startsWith('mcp__')) return null
  const rest = qualified.slice('mcp__'.length)
  const idx = rest.indexOf('__')
  if (idx <= 0) return null
  return { server: rest.slice(0, idx), tool: rest.slice(idx + 2) }
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith('mcp__') && name.includes('__', 5)
}

export function normalizeMcpServers(raw: unknown): McpServersMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: McpServersMap = {}
  for (const [name, cfg] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || !cfg || typeof cfg !== 'object') continue
    const c = cfg as Record<string, unknown>
    const type = typeof c.type === 'string' ? c.type : undefined
    if (type === 'http' || type === 'sse') {
      if (typeof c.url !== 'string' || !c.url.trim()) continue
      out[name] = {
        type,
        url: c.url.trim(),
        headers:
          c.headers && typeof c.headers === 'object' && !Array.isArray(c.headers)
            ? (c.headers as Record<string, string>)
            : undefined,
        disabled: Boolean(c.disabled)
      }
    } else if (typeof c.command === 'string' && c.command.trim()) {
      out[name] = {
        type: type === 'stdio' ? 'stdio' : undefined,
        command: c.command.trim(),
        args: Array.isArray(c.args)
          ? c.args.filter((a): a is string => typeof a === 'string')
          : [],
        env:
          c.env && typeof c.env === 'object' && !Array.isArray(c.env)
            ? (c.env as Record<string, string>)
            : undefined,
        disabled: Boolean(c.disabled)
      }
    }
  }
  return out
}

export type McpToolAnnotations = {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  openWorldHint?: boolean
}

/** Runtime policy for MCP tools (CC annotations.readOnlyHint). */
const mcpAnnotations = new Map<string, McpToolAnnotations>()

export function setMcpToolAnnotations(
  qualifiedName: string,
  ann: McpToolAnnotations | undefined
): void {
  if (!ann) {
    mcpAnnotations.delete(qualifiedName)
    return
  }
  mcpAnnotations.set(qualifiedName, ann)
}

export function getMcpToolAnnotations(
  qualifiedName: string
): McpToolAnnotations | undefined {
  return mcpAnnotations.get(qualifiedName)
}

export function clearMcpToolAnnotations(): void {
  mcpAnnotations.clear()
}

/** Drop annotation entries for one server prefix (S11 tool-list merge). */
export function clearMcpToolAnnotationsForServer(server: string): void {
  const prefix = `mcp__${sanitizeMcpName(server)}__`
  for (const key of [...mcpAnnotations.keys()]) {
    if (key.startsWith(prefix)) mcpAnnotations.delete(key)
  }
}

export type McpServerState =
  | 'connected'
  | 'error'
  | 'disconnected'
  | 'disabled'
  | 'needs_auth'

export type McpServerStatus = {
  name: string
  transport: 'stdio' | 'http' | 'sse' | 'unknown'
  state: McpServerState
  error?: string
  toolCount: number
  resourceCount: number
  /** Present when OAuth required / in progress (CC McpAuthTool spirit). Redacted. */
  authUrl?: string
  /** True when a persisted access_token exists (never exposes the secret). */
  hasStoredAuth?: boolean
}

export function mcpToolToDefinition(
  server: string,
  tool: {
    name: string
    description?: string
    inputSchema?: Record<string, unknown>
    annotations?: McpToolAnnotations
  }
): ToolDefinition {
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object'
    ? tool.inputSchema
    : { type: 'object', properties: {} }
  const qualified = mcpToolName(server, tool.name)
  if (tool.annotations) {
    setMcpToolAnnotations(qualified, tool.annotations)
  } else {
    setMcpToolAnnotations(qualified, undefined)
  }
  return {
    type: 'function',
    function: {
      name: qualified,
      description: `[MCP:${server}] ${tool.description || tool.name}`,
      parameters: {
        ...schema,
        type: schema.type || 'object'
      }
    }
  }
}
