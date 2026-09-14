/**
 * MCP connection manager (M17 + S11).
 * OAuth for HTTP/SSE, per-server tool merge, elicitation — CC services/mcp spirit.
 * Failures stay per-server; never throw into the agent loop.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { UnauthorizedError, auth } from '@modelcontextprotocol/sdk/client/auth.js'
import {
  ElicitRequestSchema,
  type ElicitResult
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolDefinition } from '../../shared/types.js'
import { mcpElicitationBroker } from './elicitation.js'
import {
  expandEnvRecord,
  expandEnvVarsInString,
  redactSecretsInText
} from './mcpSecrets.js'
import {
  createMcpOAuthProvider,
  getMcpOAuthRedirectUrl,
  isMcpAuthorizeTool,
  mcpAuthorizeToolName,
  MCP_AUTHORIZE_TOOL,
  type AckemOAuthProvider
} from './oauthProvider.js'
import { hasOAuthTokens } from './tokenStore.js'
import {
  clearMcpToolAnnotations,
  clearMcpToolAnnotationsForServer,
  mcpToolToDefinition,
  normalizeMcpServers,
  parseMcpToolName,
  sanitizeMcpName,
  type McpServerConfig,
  type McpServerStatus,
  type McpServersMap,
  type McpToolAnnotations
} from './types.js'

type Connected = {
  name: string
  config: McpServerConfig
  client: Client | null
  transport: 'stdio' | 'http' | 'sse'
  /** Live transport for finishAuth (http/sse). */
  httpTransport?: StreamableHTTPClientTransport | SSEClientTransport
  provider?: AckemOAuthProvider
  tools: ToolDefinition[]
  resources: Array<{
    uri: string
    name: string
    description?: string
    mimeType?: string
  }>
  error?: string
  state: McpServerStatus['state']
  authUrl?: string
  hasStoredAuth?: boolean
}

function transportKind(cfg: McpServerConfig): 'stdio' | 'http' | 'sse' {
  if ('url' in cfg && (cfg.type === 'http' || cfg.type === 'sse')) return cfg.type
  return 'stdio'
}

function isUnauthorized(e: unknown): boolean {
  if (e instanceof UnauthorizedError) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /unauthorized|401|authentication required/i.test(msg)
}

/** Replace tools for one server without touching others (S11 merge). */
export function mergeServerToolDefinitions(
  existing: ToolDefinition[],
  serverName: string,
  nextForServer: ToolDefinition[]
): ToolDefinition[] {
  const prefix = `mcp__${sanitizeMcpName(serverName)}__`
  const kept = existing.filter((t) => !t.function.name.startsWith(prefix))
  return [...kept, ...nextForServer]
}

function authToolDefinition(server: string, _authUrl?: string): ToolDefinition {
  // Do not embed raw OAuth URLs (state/code_challenge) into the model tool list.
  // The authorize tool result returns the live URL for the user to open.
  return {
    type: 'function',
    function: {
      name: mcpAuthorizeToolName(server),
      description: `[MCP:${server}] Server requires OAuth authentication. Call this tool to start OAuth and receive an authorization URL to share with the user. After login in the browser, tools will appear automatically.`,
      parameters: { type: 'object', properties: {} }
    }
  }
}

/** Expand ${VAR} in stdio/http MCP config before connect (CC envExpansion). */
export function expandMcpServerConfig(cfg: McpServerConfig): {
  config: McpServerConfig
  missingVars: string[]
} {
  const missingVars: string[] = []
  if ('url' in cfg && (cfg.type === 'http' || cfg.type === 'sse')) {
    const urlR = expandEnvVarsInString(cfg.url)
    missingVars.push(...urlR.missingVars)
    let headers = cfg.headers
    if (headers) {
      const hr = expandEnvRecord(headers)
      headers = hr.env
      missingVars.push(...hr.missingVars)
    }
    return {
      config: { ...cfg, url: urlR.expanded, headers },
      missingVars: [...new Set(missingVars)]
    }
  }
  const stdio = cfg as Extract<McpServerConfig, { command: string }>
  const cmdR = expandEnvVarsInString(stdio.command)
  missingVars.push(...cmdR.missingVars)
  const args = (stdio.args || []).map((a) => {
    const r = expandEnvVarsInString(a)
    missingVars.push(...r.missingVars)
    return r.expanded
  })
  const envR = expandEnvRecord(stdio.env)
  missingVars.push(...envR.missingVars)
  return {
    config: {
      ...stdio,
      command: cmdR.expanded,
      args,
      env: envR.env
    },
    missingVars: [...new Set(missingVars)]
  }
}

export class McpManager {
  private servers = new Map<string, Connected>()
  private connecting: Promise<void> | null = null
  private oauthPort = Number(process.env.ACKEMCODE_PORT || 8787)
  private settingsSnapshot: McpServersMap = {}

  setOAuthPort(port: number): void {
    this.oauthPort = port
  }

  status(): McpServerStatus[] {
    return [...this.servers.values()].map((s) => ({
      name: s.name,
      transport: s.transport,
      state: s.state,
      // Redact token-like substrings in errors; keep authUrl intact for Host UI open.
      error: s.error ? redactSecretsInText(s.error) : undefined,
      toolCount:
        s.state === 'needs_auth' ? 1 : s.tools.length,
      resourceCount: s.resources.length,
      authUrl: s.authUrl,
      hasStoredAuth: Boolean(s.hasStoredAuth)
    }))
  }

  toolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = []
    for (const s of this.servers.values()) {
      if (s.state === 'connected') defs.push(...s.tools)
      else if (s.state === 'needs_auth') {
        defs.push(authToolDefinition(s.name, s.authUrl))
      }
    }
    return defs
  }

  listAllResources(): Array<{
    server: string
    uri: string
    name: string
    description?: string
    mimeType?: string
  }> {
    const out: Array<{
      server: string
      uri: string
      name: string
      description?: string
      mimeType?: string
    }> = []
    for (const s of this.servers.values()) {
      if (s.state !== 'connected') continue
      for (const r of s.resources) {
        out.push({ server: s.name, ...r })
      }
    }
    return out
  }

  async syncFromSettings(raw: unknown): Promise<McpServerStatus[]> {
    const map = normalizeMcpServers(raw)
    const keyed: McpServersMap = {}
    for (const [n, cfg] of Object.entries(map)) {
      keyed[sanitizeMcpName(n)] = cfg
    }
    this.settingsSnapshot = keyed
    if (this.connecting) await this.connecting
    this.connecting = this.reconnectAll(keyed)
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
    return this.status()
  }

  /**
   * Reconnect a single server (S11) — merges its tools; does not wipe others.
   */
  async reconnectServer(serverName: string): Promise<McpServerStatus | null> {
    const key = sanitizeMcpName(serverName)
    const cfg = this.settingsSnapshot[key] ?? this.settingsSnapshot[serverName]
    if (!cfg) {
      // try find by sanitized key in snapshot
      const entry = Object.entries(this.settingsSnapshot).find(
        ([n]) => sanitizeMcpName(n) === key
      )
      if (!entry) return null
      return this.connectAndReplace(sanitizeMcpName(entry[0]), entry[1])
    }
    return this.connectAndReplace(key, cfg)
  }

  private async connectAndReplace(
    name: string,
    cfg: McpServerConfig
  ): Promise<McpServerStatus> {
    await this.disconnectOne(name)
    if (cfg.disabled) {
      const row: Connected = {
        name,
        config: cfg,
        client: null,
        transport: transportKind(cfg),
        tools: [],
        resources: [],
        state: 'disabled'
      }
      this.servers.set(name, row)
      return this.status().find((s) => s.name === name)!
    }
    try {
      const connected = await this.connectOne(name, cfg)
      this.servers.set(name, connected)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.servers.set(name, {
        name,
        config: cfg,
        client: null,
        transport: transportKind(cfg),
        tools: [],
        resources: [],
        state: 'error',
        error: msg,
        hasStoredAuth: await hasOAuthTokens(name)
      })
    }
    return this.status().find((s) => s.name === name)!
  }

  private async reconnectAll(map: McpServersMap): Promise<void> {
    const nextKeys = new Set(
      Object.keys(map).map((n) => sanitizeMcpName(n))
    )
    // Drop servers removed from settings
    for (const key of [...this.servers.keys()]) {
      if (!nextKeys.has(key)) await this.disconnectOne(key)
    }
    const entries = Object.entries(map)
    await Promise.all(
      entries.map(async ([name, cfg]) => {
        const key = sanitizeMcpName(name)
        await this.connectAndReplace(key, cfg)
      })
    )
  }

  private async disconnectOne(name: string): Promise<void> {
    const key = sanitizeMcpName(name)
    const prev = this.servers.get(key)
    this.servers.delete(key)
    clearMcpToolAnnotationsForServer(key)
    if (!prev?.client) return
    try {
      await prev.client.close()
    } catch {
      /* ignore */
    }
  }

  private async connectOne(
    name: string,
    cfg: McpServerConfig
  ): Promise<Connected> {
    const expanded = expandMcpServerConfig(cfg)
    if (expanded.missingVars.length > 0) {
      throw new Error(
        `MCP ${name}: missing env vars ${expanded.missingVars.map((v) => `\${${v}}`).join(', ')}`
      )
    }
    cfg = expanded.config
    const kind = transportKind(cfg)
    const storedAuth = await hasOAuthTokens(name)
    const client = new Client(
      { name: 'ackem-code', version: '0.1.0' },
      {
        capabilities: {
          elicitation: {}
        },
        listChanged: {
          tools: {
            onChanged: (error, tools) => {
              if (error) {
                console.error(`[mcp:${name}] tools list_changed failed`, error)
                return
              }
              try {
                this.applyListedTools(name, tools || [])
              } catch (e) {
                console.error(`[mcp:${name}] tools merge failed`, e)
              }
            }
          }
        }
      }
    )

    let provider: AckemOAuthProvider | undefined
    let httpTransport: StreamableHTTPClientTransport | SSEClientTransport | undefined

    try {
      if (kind === 'stdio') {
        const stdio = cfg as Extract<McpServerConfig, { command: string }>
        const transport = new StdioClientTransport({
          command: stdio.command,
          args: stdio.args ?? [],
          env: { ...process.env, ...(stdio.env || {}) } as Record<string, string>,
          stderr: 'pipe'
        })
        await client.connect(transport)
      } else if (kind === 'http') {
        const http = cfg as Extract<McpServerConfig, { type: 'http' | 'sse' }>
        provider = createMcpOAuthProvider({
          serverName: name,
          serverUrl: http.url,
          redirectUrl: getMcpOAuthRedirectUrl(this.oauthPort)
        })
        const transport = new StreamableHTTPClientTransport(new URL(http.url), {
          authProvider: provider,
          requestInit: http.headers ? { headers: http.headers } : undefined
        })
        httpTransport = transport
        await client.connect(transport)
      } else {
        const sse = cfg as Extract<McpServerConfig, { type: 'http' | 'sse' }>
        provider = createMcpOAuthProvider({
          serverName: name,
          serverUrl: sse.url,
          redirectUrl: getMcpOAuthRedirectUrl(this.oauthPort)
        })
        const transport = new SSEClientTransport(new URL(sse.url), {
          authProvider: provider,
          requestInit: sse.headers ? { headers: sse.headers } : undefined
        })
        httpTransport = transport
        await client.connect(transport)
      }
    } catch (e) {
      if (kind !== 'stdio' && isUnauthorized(e) && provider) {
        const authUrl = provider.lastAuthorizationUrl || undefined
        return {
          name,
          config: cfg,
          client: null,
          transport: kind,
          provider,
          httpTransport,
          tools: [],
          resources: [],
          state: 'needs_auth',
          authUrl,
          error: 'OAuth required',
          hasStoredAuth: storedAuth
        }
      }
      throw e
    }

    this.registerElicitation(client, name)

    const tools = await this.fetchTools(client, name)
    const resources = await this.fetchResources(client)

    return {
      name,
      config: cfg,
      client,
      transport: kind,
      provider,
      httpTransport,
      tools,
      resources,
      state: 'connected',
      hasStoredAuth: storedAuth
    }
  }

  private registerElicitation(client: Client, serverName: string): void {
    try {
      client.setRequestHandler(ElicitRequestSchema, async (request) => {
        const params = request.params
        try {
          return await mcpElicitationBroker.request(serverName, params)
        } catch (e) {
          const result: ElicitResult = {
            action: 'cancel',
            content: {
              error: e instanceof Error ? e.message : String(e)
            }
          }
          return result
        }
      })
    } catch (e) {
      console.error(`[mcp:${serverName}] elicitation handler not registered`, e)
    }
  }

  private async fetchTools(
    client: Client,
    serverName: string
  ): Promise<ToolDefinition[]> {
    try {
      const listed = await client.listTools()
      return (listed.tools || []).map((t) => this.toDef(serverName, t))
    } catch {
      return []
    }
  }

  private async fetchResources(client: Client): Promise<Connected['resources']> {
    try {
      const listed = await client.listResources()
      return (listed.resources || []).map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      }))
    } catch {
      return []
    }
  }

  private toDef(
    serverName: string,
    t: {
      name: string
      description?: string
      inputSchema?: unknown
      annotations?: McpToolAnnotations
    }
  ): ToolDefinition {
    const rawAnn = t.annotations
    const annotations: McpToolAnnotations | undefined = rawAnn
      ? {
          readOnlyHint: Boolean(rawAnn.readOnlyHint),
          destructiveHint:
            rawAnn.destructiveHint != null
              ? Boolean(rawAnn.destructiveHint)
              : undefined,
          openWorldHint:
            rawAnn.openWorldHint != null
              ? Boolean(rawAnn.openWorldHint)
              : undefined
        }
      : undefined
    return mcpToolToDefinition(serverName, {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      annotations
    })
  }

  /** Apply refreshed tool list for one server (list_changed / manual refresh). */
  applyListedTools(
    serverName: string,
    tools: Array<{
      name: string
      description?: string
      inputSchema?: unknown
      annotations?: McpToolAnnotations
    }>
  ): void {
    const key = sanitizeMcpName(serverName)
    const row = this.servers.get(key)
    if (!row) return
    clearMcpToolAnnotationsForServer(key)
    row.tools = tools.map((t) => this.toDef(key, t))
  }

  async disconnectAll(): Promise<void> {
    const keys = [...this.servers.keys()]
    for (const k of keys) await this.disconnectOne(k)
    clearMcpToolAnnotations()
  }

  /**
   * Start OAuth for a needs_auth (or http/sse) server — CC McpAuthTool / performMCPOAuthFlow.
   * Returns authorization URL for the user; does not open a browser.
   */
  async startAuth(
    serverName: string
  ): Promise<{ ok: boolean; authUrl?: string; message: string }> {
    const key = sanitizeMcpName(serverName)
    let row = this.servers.get(key)
    const cfg =
      row?.config ||
      this.settingsSnapshot[key] ||
      Object.entries(this.settingsSnapshot).find(
        ([n]) => sanitizeMcpName(n) === key
      )?.[1]

    if (!cfg || transportKind(cfg) === 'stdio') {
      return {
        ok: false,
        message: `Server "${serverName}" does not support OAuth (stdio or missing)`
      }
    }
    const url = 'url' in cfg ? cfg.url : ''
    if (!url) {
      return { ok: false, message: 'No server URL for OAuth' }
    }

    const provider =
      row?.provider ||
      createMcpOAuthProvider({
        serverName: key,
        serverUrl: url,
        redirectUrl: getMcpOAuthRedirectUrl(this.oauthPort)
      })
    provider.clearAuthorizationUrl()

    try {
      const result = await auth(provider, { serverUrl: url })
      if (result === 'AUTHORIZED') {
        await this.reconnectServer(key)
        return {
          ok: true,
          message: 'Already authorized; reconnected and loaded tools.'
        }
      }
    } catch (e) {
      // Expect UnauthorizedError / REDIRECT path — URL captured on provider
      if (!isUnauthorized(e) && !provider.lastAuthorizationUrl) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e)
        }
      }
    }

    const authUrl = provider.lastAuthorizationUrl || row?.authUrl
    if (!authUrl) {
      return {
        ok: false,
        message:
          'OAuth did not produce an authorization URL (server may lack OAuth metadata).'
      }
    }

    this.servers.set(key, {
      name: key,
      config: cfg,
      client: null,
      transport: transportKind(cfg),
      provider,
      tools: [],
      resources: [],
      state: 'needs_auth',
      authUrl,
      error: 'OAuth required',
      hasStoredAuth: await hasOAuthTokens(key)
    })

    return {
      ok: true,
      authUrl,
      message: `Open this URL to authorize, then the callback will reconnect:\n${authUrl}`
    }
  }

  /**
   * Complete OAuth after browser redirect (authorization code).
   */
  async completeAuth(
    serverName: string,
    authorizationCode: string
  ): Promise<{ ok: boolean; message: string; status?: McpServerStatus }> {
    const key = sanitizeMcpName(serverName)
    const row = this.servers.get(key)
    const cfg =
      row?.config ||
      this.settingsSnapshot[key] ||
      Object.entries(this.settingsSnapshot).find(
        ([n]) => sanitizeMcpName(n) === key
      )?.[1]
    if (!cfg || !('url' in cfg)) {
      return { ok: false, message: `Unknown MCP server for OAuth: ${serverName}` }
    }

    const provider =
      row?.provider ||
      createMcpOAuthProvider({
        serverName: key,
        serverUrl: cfg.url,
        redirectUrl: getMcpOAuthRedirectUrl(this.oauthPort)
      })

    try {
      const result = await auth(provider, {
        serverUrl: cfg.url,
        authorizationCode
      })
      if (result !== 'AUTHORIZED') {
        return {
          ok: false,
          message: `OAuth not authorized (result=${result})`
        }
      }
      const status = await this.reconnectServer(key)
      return {
        ok: status?.state === 'connected',
        message:
          status?.state === 'connected'
            ? `Authorized and connected "${key}" (${status.toolCount} tools).`
            : `Auth saved but connect state=${status?.state}: ${status?.error || ''}`,
        status: status ?? undefined
      }
    } catch (e) {
      return {
        ok: false,
        message: redactSecretsInText(
          e instanceof Error ? e.message : String(e)
        )
      }
    }
  }

  async callTool(
    qualifiedName: string,
    args: Record<string, unknown>
  ): Promise<{ ok: boolean; output: string }> {
    if (isMcpAuthorizeTool(qualifiedName)) {
      const parsed = parseMcpToolName(qualifiedName)
      if (!parsed) {
        return { ok: false, output: `Not an MCP tool: ${qualifiedName}` }
      }
      const started = await this.startAuth(parsed.server)
      return {
        ok: started.ok,
        output: started.authUrl
          ? `${started.message}\n\nauthUrl: ${started.authUrl}`
          : started.message
      }
    }

    const parsed = parseMcpToolName(qualifiedName)
    if (!parsed) {
      return { ok: false, output: `Not an MCP tool: ${qualifiedName}` }
    }
    const server = this.servers.get(sanitizeMcpName(parsed.server))
    if (server?.state === 'needs_auth') {
      return {
        ok: false,
        output: `MCP server "${parsed.server}" needs OAuth. Call ${mcpAuthorizeToolName(parsed.server)} or use the MCP panel Authorize button.${
          server.authUrl ? `\nauthUrl: ${server.authUrl}` : ''
        }`
      }
    }
    if (!server || server.state !== 'connected' || !server.client) {
      return {
        ok: false,
        output: `MCP server "${parsed.server}" is not connected (${server?.state || 'missing'}${
          server?.error ? `: ${server.error}` : ''
        })`
      }
    }
    try {
      const result = await server.client.callTool({
        name: parsed.tool,
        arguments: args
      })
      const content = Array.isArray((result as { content?: unknown }).content)
        ? (result as { content: Array<{ type?: string; text?: string }> }).content
        : []
      const text = content
        .map((c) => (c.type === 'text' ? c.text || '' : JSON.stringify(c)))
        .join('\n')
        .trim()
      const isError = Boolean((result as { isError?: boolean }).isError)
      return {
        ok: !isError,
        output: text || JSON.stringify(result, null, 2)
      }
    } catch (e) {
      if (isUnauthorized(e)) {
        server.state = 'needs_auth'
        server.error = 'OAuth required'
        server.client = null
        return {
          ok: false,
          output: `MCP server "${parsed.server}" session expired — re-authorize via ${mcpAuthorizeToolName(parsed.server)}`
        }
      }
      return {
        ok: false,
        output: e instanceof Error ? e.message : String(e)
      }
    }
  }

  async readResource(
    serverName: string,
    uri: string
  ): Promise<{ ok: boolean; output: string }> {
    const server = this.servers.get(sanitizeMcpName(serverName))
    if (!server || server.state !== 'connected' || !server.client) {
      return { ok: false, output: `MCP server "${serverName}" is not connected` }
    }
    try {
      const result = await server.client.readResource({ uri })
      const contents = result.contents || []
      const text = contents
        .map((c) => {
          if ('text' in c && typeof c.text === 'string') return c.text
          if ('blob' in c)
            return `[blob ${c.mimeType || 'binary'} ${String(c.blob).slice(0, 80)}…]`
          return JSON.stringify(c)
        })
        .join('\n\n')
      return { ok: true, output: text || JSON.stringify(result, null, 2) }
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) }
    }
  }
}

/** Process-wide manager (reconnect when settings change). */
export const mcpManager = new McpManager()

// silence unused import if tree-shaken oddly
void MCP_AUTHORIZE_TOOL
