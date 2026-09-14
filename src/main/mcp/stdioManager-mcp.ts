import type {
  McpCallToolPayload,
  McpCallToolResult,
  McpStdioApplyResult,
  McpStdioConfigFile,
  McpStdioConfigText,
  McpStdioRuntimeStatus,
  McpStdioServerConfig,
  McpStdioServerRuntimeStatus,
  McpStdioTestPayload,
  McpStdioTestResult,
  McpToolDescriptor
} from '../../shared/mcp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { shell } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createLogger } from '../logger'
import { parseMcpConfigText } from '../../shared/mcp'

type McpSession = {
  client: Client
  transport: StdioClientTransport
  config: McpStdioServerConfig
}

export interface McpStdioManager {
  ensureConfigFile: () => Promise<{ path: string }>
  openConfigFile: () => Promise<{ path: string }>
  applyAndRestart: () => Promise<McpStdioApplyResult>
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>
  stopAll: () => Promise<void>
  getRuntimeStatus: () => McpStdioRuntimeStatus
  readConfigText: () => Promise<McpStdioConfigText>
  writeConfigText: (text: string) => Promise<McpStdioConfigText>
  testServer: (payload: McpStdioTestPayload) => Promise<McpStdioTestResult>
}

const defaultMcpConfig: McpStdioConfigFile = { mcpServers: {} }
const toolNameSeparator = '::'
const mcpRequestTimeoutMs = 10_000
const mcpRequestMaxTotalTimeoutMs = 15_000
const mcpTestStderrMaxChars = 16_000

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getConfigPath(dataRoot: string): string {
  return join(dataRoot, 'mcp.json')
}

function parseQualifiedToolName(name: string): { serverName: string; toolName: string } {
  const separatorIndex = name.indexOf(toolNameSeparator)
  if (separatorIndex <= 0 || separatorIndex === name.length - toolNameSeparator.length) {
    throw new Error(`invalid MCP tool name: ${name}`)
  }
  return {
    serverName: name.slice(0, separatorIndex),
    toolName: name.slice(separatorIndex + toolNameSeparator.length)
  }
}

function resolveFallbackToolName(toolName: string): string | undefined {
  const normalizedTransportPrefix = toolName
    .replace(/^\.(?:stdio|stdo)::/, '')
    .replace(/^(?:stdio|stdo)::/, '')
  if (normalizedTransportPrefix !== toolName) return normalizedTransportPrefix

  const lastSeparatorIndex = toolName.lastIndexOf(toolNameSeparator)
  if (lastSeparatorIndex <= 0 || lastSeparatorIndex === toolName.length - toolNameSeparator.length) {
    return undefined
  }
  return toolName.slice(lastSeparatorIndex + toolNameSeparator.length)
}

async function closeSession(session: McpSession): Promise<void> {
  try {
    await session.client.close()
  } catch {
    await session.transport.close()
  }
}

function normalizeToolResult(result: unknown): McpCallToolResult {
  if (!result || typeof result !== 'object') return { toolResult: result }
  const raw = result as Record<string, unknown>
  const normalized: McpCallToolResult = {}
  if (Array.isArray(raw.content)) normalized.content = raw.content as Array<Record<string, unknown>>
  if (raw.structuredContent && typeof raw.structuredContent === 'object' && !Array.isArray(raw.structuredContent)) {
    normalized.structuredContent = raw.structuredContent as Record<string, unknown>
  }
  if (typeof raw.isError === 'boolean') normalized.isError = raw.isError
  if ('toolResult' in raw) normalized.toolResult = raw.toolResult
  return normalized
}

export function createMcpStdioManager(dataRoot: string): McpStdioManager {
  const log = createLogger('mcp-stdio')
  const sessions = new Map<string, McpSession>()
  const runtimeStatuses = new Map<string, McpStdioServerRuntimeStatus>()
  let updatedAt = Date.now()

  const setRuntimeStatus = (status: McpStdioServerRuntimeStatus) => {
    runtimeStatuses.set(status.name, status)
    updatedAt = Date.now()
  }

  const ensureConfigFile = async () => {
    const path = getConfigPath(dataRoot)
    await mkdir(dirname(path), { recursive: true })
    try {
      await readFile(path, 'utf-8')
    } catch {
      await writeFile(path, `${JSON.stringify(defaultMcpConfig, null, 2)}\n`, 'utf-8')
    }
    return { path }
  }

  const readConfigFile = async (path: string): Promise<McpStdioConfigFile> => {
    return parseMcpConfigText(await readFile(path, 'utf-8'))
  }

  const stopAll = async () => {
    const entries = [...sessions.entries()]
    for (const [name, session] of entries) {
      await closeSession(session)
      setRuntimeStatus({
        name,
        state: 'stopped',
        command: session.config.command,
        args: session.config.args ?? [],
        pid: null
      })
      sessions.delete(name)
    }
  }

  const startServer = async (name: string, config: McpStdioServerConfig) => {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      cwd: config.cwd,
      stderr: 'pipe'
    })
    const client = new Client({
      name: `ackem:mcp:${name}`,
      version: '1.0.0'
    })

    try {
      await client.connect(transport)
      transport.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8').trim()
        if (text) log.warn(`server stderr [${name}]`, { text })
      })
      sessions.set(name, { client, transport, config })
      setRuntimeStatus({
        name,
        state: 'running',
        command: config.command,
        args: config.args ?? [],
        pid: (transport as { pid?: number }).pid ?? null
      })
    } catch (error) {
      await transport.close().catch(() => {})
      throw error
    }
  }

  const applyAndRestart = async (): Promise<McpStdioApplyResult> => {
    const { path } = await ensureConfigFile()
    const config = await readConfigFile(path)
    await stopAll()
    runtimeStatuses.clear()

    const result: McpStdioApplyResult = { path, started: [], failed: [], skipped: [] }
    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (server.enabled === false) {
        result.skipped.push({ name, reason: 'disabled' })
        setRuntimeStatus({
          name,
          state: 'stopped',
          command: server.command,
          args: server.args ?? [],
          pid: null
        })
        continue
      }
      try {
        await startServer(name, server)
        result.started.push({ name })
      } catch (error) {
        const message = stringifyError(error)
        result.failed.push({ name, error: message })
        setRuntimeStatus({
          name,
          state: 'error',
          command: server.command,
          args: server.args ?? [],
          pid: null,
          lastError: message
        })
      }
    }
    updatedAt = Date.now()
    return result
  }

  const listTools = async (): Promise<McpToolDescriptor[]> => {
    const entries = [...sessions.entries()].sort(([left], [right]) => left.localeCompare(right))
    const results = await Promise.all(entries.map(async ([serverName, session]) => {
      try {
        const response = await session.client.listTools(undefined, {
          timeout: mcpRequestTimeoutMs,
          maxTotalTimeout: mcpRequestMaxTotalTimeoutMs
        })
        return response.tools.map<McpToolDescriptor>((tool) => ({
          serverName,
          name: `${serverName}${toolNameSeparator}${tool.name}`,
          toolName: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown>
        }))
      } catch (error) {
        log.warn(`failed to list MCP tools from ${serverName}`, { error: stringifyError(error) })
        return []
      }
    }))
    return results.flat()
  }

  const callTool = async (payload: McpCallToolPayload): Promise<McpCallToolResult> => {
    const { serverName, toolName } = parseQualifiedToolName(payload.name)
    const session = sessions.get(serverName)
    if (!session) throw new Error(`MCP server is not running: ${serverName}`)

    try {
      const result = await session.client.callTool(
        { name: toolName, arguments: payload.arguments ?? {} },
        undefined,
        { timeout: mcpRequestTimeoutMs, maxTotalTimeout: mcpRequestMaxTotalTimeoutMs }
      )
      return normalizeToolResult(result)
    } catch (error) {
      const fallbackToolName = resolveFallbackToolName(toolName)
      if (!fallbackToolName || fallbackToolName === toolName) throw error
      log.warn('retrying MCP tool call with normalized tool name', {
        serverName,
        requestedToolName: toolName,
        fallbackToolName
      })
      const result = await session.client.callTool(
        { name: fallbackToolName, arguments: payload.arguments ?? {} },
        undefined,
        { timeout: mcpRequestTimeoutMs, maxTotalTimeout: mcpRequestMaxTotalTimeoutMs }
      )
      return normalizeToolResult(result)
    }
  }

  const getRuntimeStatus = (): McpStdioRuntimeStatus => ({
    path: getConfigPath(dataRoot),
    servers: [...runtimeStatuses.values()].sort((left, right) => left.name.localeCompare(right.name)),
    updatedAt
  })

  const readConfigText = async (): Promise<McpStdioConfigText> => {
    const { path } = await ensureConfigFile()
    return { path, text: await readFile(path, 'utf-8') }
  }

  const writeConfigText = async (text: string): Promise<McpStdioConfigText> => {
    const { path } = await ensureConfigFile()
    const validated = parseMcpConfigText(text)
    const normalized = `${JSON.stringify(validated, null, 2)}\n`
    await writeFile(path, normalized, 'utf-8')
    return { path, text: normalized }
  }

  const testServer = async (payload: McpStdioTestPayload): Promise<McpStdioTestResult> => {
    const startedAt = Date.now()
    let transport: StdioClientTransport | null = null
    let client: Client | null = null
    const stderrChunks: string[] = []
    let timer: NodeJS.Timeout | undefined

    const withDeadline = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      })
      return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer)
      })
    }

    try {
      transport = new StdioClientTransport({
        command: payload.config.command,
        args: payload.config.args ?? [],
        env: payload.config.env,
        cwd: payload.config.cwd,
        stderr: 'pipe'
      })
      client = new Client({ name: `ackem:mcp:test:${payload.name}`, version: '1.0.0' })
      transport.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8')
        if (text) stderrChunks.push(text)
      })
      await withDeadline(client.connect(transport), mcpRequestMaxTotalTimeoutMs, 'connect')
      const response = await client.listTools(undefined, {
        timeout: mcpRequestTimeoutMs,
        maxTotalTimeout: mcpRequestMaxTotalTimeoutMs
      })
      return {
        ok: true,
        tools: response.tools.map((tool) => tool.name),
        durationMs: Date.now() - startedAt
      }
    } catch (error) {
      const stderr = stderrChunks.join('').trim().slice(-mcpTestStderrMaxChars)
      const message = stringifyError(error)
      return {
        ok: false,
        error: stderr ? `${message}\n\n${stderr}` : message,
        durationMs: Date.now() - startedAt
      }
    } finally {
      if (client) await client.close().catch(() => {})
      if (transport) await transport.close().catch(() => {})
    }
  }

  const openConfigFile = async () => {
    const { path: configPath } = await ensureConfigFile()
    const path = dirname(configPath)
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
    return { path }
  }

  return {
    ensureConfigFile,
    openConfigFile,
    applyAndRestart,
    listTools,
    callTool,
    stopAll,
    getRuntimeStatus,
    readConfigText,
    writeConfigText,
    testServer
  }
}
