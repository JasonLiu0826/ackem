import path from 'node:path'
import {
  formatDiagnosticsBlock,
  formatLspResult,
  LspServerProcess
} from './client.js'
import {
  computeLspToolEnabled,
  countConfiguredLspServers,
  LSP_OPERATIONS,
  type LspDiagnostic,
  type LspOperation,
  type LspServerStatusRow,
  type LspServersConfig
} from './types.js'

export class LspManager {
  private servers = new Map<string, LspServerProcess>()
  private workspaceRoot = ''
  private config: LspServersConfig = {}
  /** settings.lspEnabled — undefined = auto (on when servers configured) */
  private lspEnabledSetting: boolean | undefined

  hasConfiguredServers(): boolean {
    return Object.keys(this.config).length > 0
  }

  /** S12: enabled when lspServers configured (env not required). */
  isEnabled(): boolean {
    return computeLspToolEnabled({
      hasConfiguredServers: this.hasConfiguredServers(),
      lspEnabledSetting: this.lspEnabledSetting
    })
  }

  isConnected(): boolean {
    return [...this.servers.values()].some((s) => s.ready)
  }

  status(): LspServerStatusRow[] {
    return Object.keys(this.config).map((name) => {
      const cfg = this.config[name]!
      const proc = this.servers.get(name)
      if (proc) return proc.getStatus()
      return {
        name,
        ready: false,
        state: 'stopped' as const,
        extensions: cfg.extensions || [],
        restartCount: 0,
        crashRecoveryCount: 0,
        diagnosticFileCount: 0
      }
    })
  }

  getDiagnostics(opts?: {
    serverName?: string
    filePath?: string
  }): LspDiagnostic[] {
    const out: LspDiagnostic[] = []
    for (const [name, proc] of this.servers) {
      if (opts?.serverName && opts.serverName !== name) continue
      out.push(...proc.getDiagnostics(opts?.filePath))
    }
    return out
  }

  async restartServer(name: string): Promise<{ ok: boolean; output: string }> {
    const proc = this.servers.get(name)
    if (!proc) {
      if (!this.config[name]) {
        return { ok: false, output: `Unknown LSP server '${name}'` }
      }
      const created = new LspServerProcess(
        name,
        this.config[name]!,
        this.workspaceRoot
      )
      this.servers.set(name, created)
      try {
        await created.start()
        return { ok: true, output: `Started LSP server '${name}'` }
      } catch (e) {
        return {
          ok: false,
          output: e instanceof Error ? e.message : String(e)
        }
      }
    }
    try {
      await proc.restart()
      return { ok: true, output: `Restarted LSP server '${name}'` }
    } catch (e) {
      return {
        ok: false,
        output: e instanceof Error ? e.message : String(e)
      }
    }
  }

  async syncFromSettings(
    workspaceRoot: string,
    lspServers: LspServersConfig | undefined,
    lspEnabledSetting?: boolean
  ): Promise<void> {
    await this.disconnectAll()
    this.workspaceRoot = path.resolve(workspaceRoot || process.cwd())
    this.lspEnabledSetting = lspEnabledSetting
    this.config = {}
    if (!lspServers || typeof lspServers !== 'object') return
    for (const [name, cfg] of Object.entries(lspServers)) {
      if (!cfg || cfg.disabled) continue
      if (!cfg.command || !Array.isArray(cfg.extensions) || !cfg.extensions.length) {
        continue
      }
      this.config[name] = {
        command: cfg.command,
        args: cfg.args,
        extensions: cfg.extensions.map((e) =>
          e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
        ),
        disabled: cfg.disabled,
        maxRestarts: cfg.maxRestarts,
        requestTimeoutMs: cfg.requestTimeoutMs,
        initTimeoutMs: cfg.initTimeoutMs,
        env: cfg.env,
        initializationOptions: cfg.initializationOptions
      }
    }
  }

  /** R5: public accessor for passive feedback (extension-matched server). */
  pickServerForFile(filePath: string): LspServerProcess | null {
    return this.pickServer(filePath)
  }

  private pickServer(filePath: string): LspServerProcess | null {
    const ext = path.extname(filePath).toLowerCase()
    for (const [name, cfg] of Object.entries(this.config)) {
      if (!cfg.extensions.includes(ext)) continue
      let proc = this.servers.get(name)
      if (!proc) {
        proc = new LspServerProcess(name, cfg, this.workspaceRoot)
        this.servers.set(name, proc)
      }
      return proc
    }
    return null
  }

  async run(opts: {
    operation: string
    filePath: string
    line: number
    character: number
    cwd: string
    /** Optional workspaceSymbol query (CC uses file context; we allow override). */
    query?: string
  }): Promise<{ ok: boolean; output: string }> {
    if (!this.isEnabled()) {
      const configured = countConfiguredLspServers(this.config)
      return {
        ok: false,
        output:
          configured === 0
            ? 'LSP tool unavailable: configure settings.lspServers (extensions + command). Env ACKEM_ENABLE_LSP is no longer required.'
            : 'LSP tool disabled (settings.lspEnabled=false or ACKEM_ENABLE_LSP=0).'
      }
    }
    if (!LSP_OPERATIONS.includes(opts.operation as LspOperation)) {
      return {
        ok: false,
        output: `Unknown operation. Use one of: ${LSP_OPERATIONS.join(', ')}`
      }
    }
    const op = opts.operation as LspOperation

    if (!Number.isFinite(opts.line) || opts.line < 1) {
      return { ok: false, output: 'line must be a positive 1-based integer' }
    }
    if (!Number.isFinite(opts.character) || opts.character < 1) {
      return {
        ok: false,
        output: 'character must be a positive 1-based integer'
      }
    }

    const abs = path.isAbsolute(opts.filePath)
      ? opts.filePath
      : path.resolve(opts.cwd, opts.filePath)

    if (!this.hasConfiguredServers()) {
      return {
        ok: false,
        output:
          'No LSP servers configured. Add settings.lspServers with matching extensions.'
      }
    }

    const proc = this.pickServer(abs)
    if (!proc) {
      return {
        ok: false,
        output: `No LSP server configured for ${path.extname(abs) || '(no ext)'}. Add settings.lspServers with matching extensions.`
      }
    }

    try {
      const result = await proc.requestOp(
        op,
        abs,
        opts.line,
        opts.character,
        opts.query
      )
      const formatted = formatLspResult(op, result)
      const diags = proc.getDiagnostics(abs)
      const diagBlock =
        diags.length > 0
          ? ['', '--- diagnostics ---', formatDiagnosticsBlock(diags)].join(
              '\n'
            )
          : ''
      return {
        ok: true,
        output: [
          `operation=${op}`,
          `file=${abs}`,
          `pos=${opts.line}:${opts.character}`,
          `server=${proc.name}`,
          '',
          formatted + diagBlock
        ].join('\n')
      }
    } catch (e) {
      const st = proc.getStatus()
      const hint =
        st.state === 'error'
          ? ` (server state=error` +
            (st.lastError ? `; lastError=${st.lastError}` : '') +
            `; crashRecovery=${st.crashRecoveryCount}; restarts=${st.restartCount})`
          : ''
      return {
        ok: false,
        output:
          (e instanceof Error ? e.message : String(e)) +
          hint
      }
    }
  }

  async disconnectAll(): Promise<void> {
    const all = [...this.servers.values()]
    this.servers.clear()
    await Promise.all(all.map((s) => s.stop().catch(() => {})))
  }
}

export const lspManager = new LspManager()
