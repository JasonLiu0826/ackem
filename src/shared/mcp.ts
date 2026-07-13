export interface McpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

export interface McpStdioConfigFile {
  mcpServers: Record<string, McpStdioServerConfig>
}

export interface McpStdioApplyResult {
  path: string
  started: Array<{ name: string }>
  failed: Array<{ name: string; error: string }>
  skipped: Array<{ name: string; reason: string }>
}

export interface McpStdioServerRuntimeStatus {
  name: string
  state: 'running' | 'stopped' | 'error'
  command: string
  args: string[]
  pid: number | null
  lastError?: string
}

export interface McpStdioRuntimeStatus {
  path: string
  servers: McpStdioServerRuntimeStatus[]
  updatedAt: number
}

export interface McpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

export interface McpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

export interface McpStdioConfigText {
  path: string
  text: string
}

export interface McpStdioTestPayload {
  name: string
  config: McpStdioServerConfig
}

export interface McpStdioTestResult {
  ok: boolean
  tools?: string[]
  error?: string
  durationMs: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${path} must be an array of strings`)
  }
  return value
}

function assertStringRecord(value: unknown, path: string): Record<string, string> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error(`${path}.${key} must be a string`)
    out[key] = item
  }
  return out
}

export function parseMcpConfig(value: unknown): McpStdioConfigFile {
  if (!isRecord(value)) throw new Error('<root> must be an object')
  const rawServers = value.mcpServers
  if (!isRecord(rawServers)) throw new Error('mcpServers must be an object')

  const mcpServers: Record<string, McpStdioServerConfig> = {}
  for (const [name, rawServer] of Object.entries(rawServers)) {
    if (!isRecord(rawServer)) throw new Error(`mcpServers.${name} must be an object`)
    const command = rawServer.command
    if (typeof command !== 'string' || !command.trim()) {
      throw new Error(`mcpServers.${name}.command must be a non-empty string`)
    }

    const allowed = new Set(['command', 'args', 'env', 'cwd', 'enabled'])
    for (const key of Object.keys(rawServer)) {
      if (!allowed.has(key)) throw new Error(`mcpServers.${name}.${key} is not supported`)
    }

    const server: McpStdioServerConfig = { command: command.trim() }
    if (rawServer.args !== undefined) server.args = assertStringArray(rawServer.args, `mcpServers.${name}.args`)
    if (rawServer.env !== undefined) server.env = assertStringRecord(rawServer.env, `mcpServers.${name}.env`)
    if (rawServer.cwd !== undefined) {
      if (typeof rawServer.cwd !== 'string') throw new Error(`mcpServers.${name}.cwd must be a string`)
      server.cwd = rawServer.cwd
    }
    if (rawServer.enabled !== undefined) {
      if (typeof rawServer.enabled !== 'boolean') throw new Error(`mcpServers.${name}.enabled must be a boolean`)
      server.enabled = rawServer.enabled
    }
    mcpServers[name] = server
  }

  return { mcpServers }
}

export function parseMcpConfigText(text: string): McpStdioConfigFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parseMcpConfig(parsed)
}
