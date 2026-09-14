export type LspServerConfig = {
  command: string
  args?: string[]
  /** File extensions this server handles, e.g. [".ts", ".tsx"] */
  extensions: string[]
  disabled?: boolean
  /** Cap crash auto-recovery attempts (CC maxRestarts spirit; default 3). */
  maxRestarts?: number
  /** Per-request timeout ms (default 20000; ACKEM_LSP_REQUEST_TIMEOUT_MS). */
  requestTimeoutMs?: number
  /** Initialize timeout ms (default 30000; ACKEM_LSP_INIT_TIMEOUT_MS). */
  initTimeoutMs?: number
  env?: Record<string, string>
  initializationOptions?: Record<string, unknown>
}

export type LspServersConfig = Record<string, LspServerConfig>

/** Lifecycle states — Claude Code LspServerState spirit. */
export type LspServerState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export type LspServerStatusRow = {
  name: string
  ready: boolean
  state: LspServerState
  extensions: string[]
  lastError?: string
  restartCount: number
  crashRecoveryCount: number
  startTime?: string
  diagnosticFileCount: number
}

/** All LSPTool operations (Claude Code LSPTool schemas spirit). */
export const LSP_OPERATIONS = [
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls'
] as const

export type LspOperation = (typeof LSP_OPERATIONS)[number]

/** Core ops expected stable for TS/JS acceptance (S12). */
export const LSP_CORE_OPS = new Set<LspOperation>([
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls'
])

export const LSP_ERROR_CONTENT_MODIFIED = -32801
export const MAX_TRANSIENT_RETRIES = 3
export const TRANSIENT_RETRY_BASE_MS = 500
export const DEFAULT_LSP_REQUEST_TIMEOUT_MS = 20_000
export const DEFAULT_LSP_INIT_TIMEOUT_MS = 30_000
export const DEFAULT_LSP_MAX_RESTARTS = 3

export function resolveRequestTimeoutMs(cfg?: LspServerConfig): number {
  const env = Number(process.env.ACKEM_LSP_REQUEST_TIMEOUT_MS)
  if (Number.isFinite(env) && env > 0) return Math.floor(env)
  if (cfg?.requestTimeoutMs && cfg.requestTimeoutMs > 0) {
    return Math.floor(cfg.requestTimeoutMs)
  }
  return DEFAULT_LSP_REQUEST_TIMEOUT_MS
}

export function resolveInitTimeoutMs(cfg?: LspServerConfig): number {
  const env = Number(process.env.ACKEM_LSP_INIT_TIMEOUT_MS)
  if (Number.isFinite(env) && env > 0) return Math.floor(env)
  if (cfg?.initTimeoutMs && cfg.initTimeoutMs > 0) {
    return Math.floor(cfg.initTimeoutMs)
  }
  return DEFAULT_LSP_INIT_TIMEOUT_MS
}

export function resolveMaxRestarts(cfg?: LspServerConfig): number {
  if (cfg?.maxRestarts != null && Number.isFinite(cfg.maxRestarts)) {
    return Math.max(0, Math.floor(cfg.maxRestarts))
  }
  const env = Number(process.env.ACKEM_LSP_MAX_RESTARTS)
  if (Number.isFinite(env) && env >= 0) return Math.floor(env)
  return DEFAULT_LSP_MAX_RESTARTS
}

export function isLspEnvForcedOff(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const a = env.ACKEM_ENABLE_LSP
  const b = env.ENABLE_LSP_TOOL
  return a === '0' || a === 'false' || b === '0' || b === 'false'
}

export function isLspEnvForcedOn(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const a = env.ACKEM_ENABLE_LSP
  const b = env.ENABLE_LSP_TOOL
  return a === '1' || a === 'true' || b === '1' || b === 'true'
}

/**
 * S12: LSP tool available when servers are configured (no env required).
 * - settings.lspEnabled === false → off
 * - ACKEM_ENABLE_LSP=0 / ENABLE_LSP_TOOL=0 → force off
 * - hasConfiguredServers → on
 * - legacy: env force-on still exposes the tool (clear error if no server)
 */
export function computeLspToolEnabled(opts: {
  hasConfiguredServers: boolean
  lspEnabledSetting?: boolean
  env?: NodeJS.ProcessEnv
}): boolean {
  const env = opts.env ?? process.env
  if (isLspEnvForcedOff(env)) return false
  if (opts.lspEnabledSetting === false) return false
  if (opts.hasConfiguredServers) return true
  if (isLspEnvForcedOn(env)) return true
  return false
}

/**
 * Legacy env-only gate (M21). Prefer `computeLspToolEnabled` / `lspManager.isEnabled()`.
 */
export function isLspEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isLspEnvForcedOff(env)) return false
  return isLspEnvForcedOn(env)
}

export function countConfiguredLspServers(
  lspServers: LspServersConfig | undefined
): number {
  if (!lspServers || typeof lspServers !== 'object') return 0
  let n = 0
  for (const cfg of Object.values(lspServers)) {
    if (!cfg || cfg.disabled) continue
    if (!cfg.command || !Array.isArray(cfg.extensions) || !cfg.extensions.length) {
      continue
    }
    n += 1
  }
  return n
}

export type LspDiagnostic = {
  uri: string
  severity?: number
  message: string
  source?: string
  code?: string | number
  line: number
  character: number
}

export function formatDiagnostics(diags: readonly LspDiagnostic[]): string {
  if (!diags.length) return '(no diagnostics)'
  const sev = (n?: number) =>
    n === 1
      ? 'Error'
      : n === 2
        ? 'Warning'
        : n === 3
          ? 'Info'
          : n === 4
            ? 'Hint'
            : 'Diag'
  return diags
    .slice(0, 50)
    .map(
      (d) =>
        `${sev(d.severity)} ${d.line}:${d.character} ${d.message}` +
        (d.source ? ` [${d.source}]` : '')
    )
    .join('\n')
}
