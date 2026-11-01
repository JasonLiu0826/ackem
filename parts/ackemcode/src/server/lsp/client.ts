/**
 * Minimal stdio LSP client — Claude Code LSPClient / LSPServerInstance spirit.
 * GM-LSP: state machine, crash recovery cap, timeouts, transient retry, diagnostics.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  formatDiagnostics,
  LSP_ERROR_CONTENT_MODIFIED,
  MAX_TRANSIENT_RETRIES,
  TRANSIENT_RETRY_BASE_MS,
  resolveInitTimeoutMs,
  resolveMaxRestarts,
  resolveRequestTimeoutMs,
  type LspDiagnostic,
  type LspOperation,
  type LspServerConfig,
  type LspServerState,
  type LspServerStatusRow
} from './types.js'

type Pending = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer!))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isTransientLspError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const msg = e.message || ''
  if (msg.includes(String(LSP_ERROR_CONTENT_MODIFIED))) return true
  if (/content modified/i.test(msg)) return true
  const code = (e as Error & { code?: number }).code
  return code === LSP_ERROR_CONTENT_MODIFIED
}

export class LspServerProcess {
  private child: ChildProcessWithoutNullStreams | null = null
  private buf = Buffer.alloc(0)
  private nextId = 1
  private pending = new Map<number, Pending>()
  private state: LspServerState = 'stopped'
  private lastError: Error | undefined
  private restartCount = 0
  private crashRecoveryCount = 0
  private startTime: Date | undefined
  private openDocs = new Set<string>()
  private diagnostics = new Map<string, LspDiagnostic[]>()
  private startGate: Promise<void> | null = null
  /** R5: per-doc version counter for didChange (full sync). */
  private docVersions = new Map<string, number>()
  /** R5: bumped on every publishDiagnostics per uri — lets callers await "fresh" results. */
  private diagGen = new Map<string, number>()

  constructor(
    readonly name: string,
    readonly config: LspServerConfig,
    readonly workspaceRoot: string
  ) {}

  get ready(): boolean {
    return this.state === 'running' && this.child != null && !this.child.killed
  }

  getStatus(): LspServerStatusRow {
    return {
      name: this.name,
      ready: this.ready,
      state: this.state,
      extensions: this.config.extensions || [],
      lastError: this.lastError?.message,
      restartCount: this.restartCount,
      crashRecoveryCount: this.crashRecoveryCount,
      startTime: this.startTime?.toISOString(),
      diagnosticFileCount: this.diagnostics.size
    }
  }

  getDiagnostics(fileUriOrPath?: string): LspDiagnostic[] {
    if (!fileUriOrPath) {
      return [...this.diagnostics.values()].flat()
    }
    const uri = fileUriOrPath.includes('://')
      ? fileUriOrPath
      : pathToFileURL(path.resolve(fileUriOrPath)).href
    return [...(this.diagnostics.get(uri) ?? [])]
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      if (this.startGate) await this.startGate
      return
    }

    const maxRestarts = resolveMaxRestarts(this.config)
    if (this.state === 'error' && this.crashRecoveryCount > maxRestarts) {
      const error = new Error(
        `LSP server '${this.name}' exceeded max crash recovery attempts (${maxRestarts})` +
          (this.lastError ? `: ${this.lastError.message}` : '')
      )
      this.lastError = error
      throw error
    }

    this.startGate = this.startInner()
    try {
      await this.startGate
    } finally {
      this.startGate = null
    }
  }

  private async startInner(): Promise<void> {
    this.state = 'starting'
    this.openDocs.clear()
    try {
      const child = spawn(this.config.command, this.config.args ?? [], {
        cwd: this.workspaceRoot,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(this.config.env || {}) }
      })
      this.child = child
      child.stdout.on('data', (chunk: Buffer) => {
        if (this.child !== child) return
        this.onData(chunk)
      })
      child.stderr?.on('data', () => {
        /* ignore server logs */
      })
      child.on('exit', (code) => {
        // Ignore stale exit from a previous child after restart/stop+start.
        if (this.child !== child) return
        const graceful = this.state === 'stopping'
        this.initializedDown()
        if (!graceful) {
          this.state = 'error'
          this.lastError = new Error(
            `LSP server '${this.name}' crashed with exit code ${code ?? 'null'}`
          )
          this.crashRecoveryCount += 1
        }
        for (const [, p] of this.pending) {
          clearTimeout(p.timer)
          p.reject(new Error(`LSP server '${this.name}' exited`))
        }
        this.pending.clear()
      })

      const rootUri = pathToFileURL(this.workspaceRoot).href
      const initMs = resolveInitTimeoutMs(this.config)
      await withTimeout(
        this.request('initialize', {
          processId: process.pid,
          rootUri,
          rootPath: this.workspaceRoot,
          initializationOptions: this.config.initializationOptions ?? {},
          capabilities: {
            textDocument: {
              hover: { contentFormat: ['markdown', 'plaintext'] },
              definition: { linkSupport: true },
              references: {},
              documentSymbol: { hierarchicalDocumentSymbolSupport: true },
              implementation: {},
              callHierarchy: {},
              publishDiagnostics: {}
            },
            workspace: { symbol: {}, configuration: false, workspaceFolders: false }
          },
          workspaceFolders: [
            { uri: rootUri, name: path.basename(this.workspaceRoot) }
          ]
        }),
        initMs,
        `LSP initialize timeout (${initMs}ms) for '${this.name}'`
      )
      this.notify('initialized', {})
      this.state = 'running'
      this.startTime = new Date()
      this.lastError = undefined
      this.crashRecoveryCount = 0
    } catch (e) {
      this.state = 'error'
      this.lastError = e instanceof Error ? e : new Error(String(e))
      // crashRecoveryCount only via unexpected exit (CC onCrash spirit)
      await this.forceKill()
      throw this.lastError
    }
  }

  private initializedDown(): void {
    this.child = null
    this.buf = Buffer.alloc(0)
  }

  private async forceKill(): Promise<void> {
    const child = this.child
    this.child = null
    if (!child) return
    try {
      child.kill()
    } catch {
      /* ignore */
    }
  }

  async stop(): Promise<void> {
    if (!this.child && this.state === 'stopped') return
    this.state = 'stopping'
    try {
      if (this.child) {
        await withTimeout(
          this.request('shutdown', null),
          5_000,
          'LSP shutdown timeout'
        ).catch(() => {})
        this.notify('exit', undefined)
      }
    } catch {
      /* ignore */
    }
    await this.forceKill()
    this.state = 'stopped'
    this.openDocs.clear()
  }

  async restart(): Promise<void> {
    const maxRestarts = resolveMaxRestarts(this.config)
    this.restartCount += 1
    if (this.restartCount > maxRestarts) {
      const error = new Error(
        `Max restart attempts (${maxRestarts}) exceeded for server '${this.name}'`
      )
      this.lastError = error
      this.state = 'error'
      throw error
    }
    try {
      await this.stop()
    } catch {
      /* continue to start */
    }
    // Manual restart resets crash counter so operator can recover.
    this.crashRecoveryCount = 0
    this.state = 'stopped'
    await this.start()
  }

  async ensureOpen(absPath: string): Promise<string> {
    const uri = pathToFileURL(absPath).href
    if (this.openDocs.has(uri)) return uri
    const text = await fs.readFile(absPath, 'utf8')
    const languageId = guessLanguageId(absPath)
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text }
    })
    this.openDocs.add(uri)
    this.docVersions.set(uri, 1)
    return uri
  }

  /**
   * R5: tell the server a file changed on disk (post write/edit). Open docs get
   * a full-sync didChange with a bumped version; unopened files get didOpen.
   */
  async notifyFileChanged(absPath: string): Promise<string> {
    await this.ensureStarted()
    const uri = pathToFileURL(absPath).href
    if (!this.openDocs.has(uri)) {
      return this.ensureOpen(absPath)
    }
    const text = await fs.readFile(absPath, 'utf8')
    const version = (this.docVersions.get(uri) ?? 1) + 1
    this.docVersions.set(uri, version)
    this.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }]
    })
    return uri
  }

  /** R5: current publishDiagnostics generation for a file (0 = never received). */
  getDiagnosticsGeneration(fileUriOrPath: string): number {
    const uri = fileUriOrPath.includes('://')
      ? fileUriOrPath
      : pathToFileURL(path.resolve(fileUriOrPath)).href
    return this.diagGen.get(uri) ?? 0
  }

  /**
   * R5: wait until the server publishes diagnostics for the file newer than
   * `sinceGen`, or until timeout. Returns diagnostics on publish, null on timeout.
   */
  async waitForFileDiagnostics(
    absPath: string,
    sinceGen: number,
    timeoutMs: number
  ): Promise<LspDiagnostic[] | null> {
    const uri = pathToFileURL(path.resolve(absPath)).href
    const deadline = Date.now() + Math.max(0, timeoutMs)
    while (Date.now() < deadline) {
      if ((this.diagGen.get(uri) ?? 0) > sinceGen) {
        return this.getDiagnostics(uri)
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    return null
  }

  async requestOp(
    operation: LspOperation,
    absPath: string,
    line: number,
    character: number,
    query?: string
  ): Promise<unknown> {
    await this.ensureStarted()
    const uri = await this.ensureOpen(absPath)
    const position = { line: line - 1, character: character - 1 }
    const textDocument = { uri }

    const runOnce = async (): Promise<unknown> => {
      switch (operation) {
        case 'hover':
          return this.request('textDocument/hover', { textDocument, position })
        case 'goToDefinition':
          return this.request('textDocument/definition', {
            textDocument,
            position
          })
        case 'findReferences':
          return this.request('textDocument/references', {
            textDocument,
            position,
            context: { includeDeclaration: true }
          })
        case 'documentSymbol':
          return this.request('textDocument/documentSymbol', { textDocument })
        case 'workspaceSymbol': {
          const q =
            (query && query.trim()) ||
            path.basename(absPath, path.extname(absPath))
          return this.request('workspace/symbol', { query: q })
        }
        case 'goToImplementation':
          return this.request('textDocument/implementation', {
            textDocument,
            position
          })
        case 'prepareCallHierarchy':
          return this.request('textDocument/prepareCallHierarchy', {
            textDocument,
            position
          })
        case 'incomingCalls':
        case 'outgoingCalls': {
          const items = (await this.request(
            'textDocument/prepareCallHierarchy',
            { textDocument, position }
          )) as unknown[] | null
          const item = Array.isArray(items) ? items[0] : null
          if (!item) return []
          const method =
            operation === 'incomingCalls'
              ? 'callHierarchy/incomingCalls'
              : 'callHierarchy/outgoingCalls'
          return this.request(method, { item })
        }
        default:
          throw new Error(`Unsupported LSP operation: ${operation}`)
      }
    }

    let lastErr: unknown
    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        return await runOnce()
      } catch (e) {
        lastErr = e
        if (!isTransientLspError(e) || attempt === MAX_TRANSIENT_RETRIES) break
        await sleep(TRANSIENT_RETRY_BASE_MS * 2 ** attempt)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  private async ensureStarted(): Promise<void> {
    if (this.ready) return
    if (this.state === 'error' || this.state === 'stopped' || !this.child) {
      await this.start()
      return
    }
    if (this.startGate) await this.startGate
    if (!this.ready) await this.start()
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.child) throw new Error(`LSP server '${this.name}' not started`)
    const id = this.nextId++
    const timeoutMs = resolveRequestTimeoutMs(this.config)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`LSP request timeout (${timeoutMs}ms): ${method}`))
        }
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  private send(msg: unknown): void {
    if (!this.child) throw new Error(`LSP server '${this.name}' not started`)
    const body = Buffer.from(JSON.stringify(msg), 'utf8')
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8')
    this.child.stdin.write(Buffer.concat([header, body]))
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk])
    while (true) {
      const headerEnd = this.buf.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = this.buf.slice(0, headerEnd).toString('utf8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.buf = this.buf.slice(headerEnd + 4)
        continue
      }
      const len = parseInt(match[1]!, 10)
      const total = headerEnd + 4 + len
      if (this.buf.length < total) return
      const body = this.buf.slice(headerEnd + 4, total).toString('utf8')
      this.buf = this.buf.slice(total)
      try {
        const msg = JSON.parse(body) as {
          id?: number
          result?: unknown
          error?: { code?: number; message?: string }
          method?: string
          params?: unknown
        }
        if (msg.method === 'textDocument/publishDiagnostics') {
          this.ingestDiagnostics(msg.params)
          continue
        }
        if (msg.id != null && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          clearTimeout(p.timer)
          if (msg.error) {
            const err = new Error(msg.error.message || 'LSP error') as Error & {
              code?: number
            }
            err.code = msg.error.code
            p.reject(err)
          } else p.resolve(msg.result)
        }
      } catch {
        /* ignore bad frame */
      }
    }
  }

  private ingestDiagnostics(params: unknown): void {
    if (!params || typeof params !== 'object') return
    const p = params as {
      uri?: string
      diagnostics?: Array<{
        message?: string
        severity?: number
        source?: string
        code?: string | number
        range?: { start?: { line?: number; character?: number } }
      }>
    }
    if (!p.uri || !Array.isArray(p.diagnostics)) return
    const list: LspDiagnostic[] = p.diagnostics.map((d) => ({
      uri: p.uri!,
      severity: d.severity,
      message: String(d.message || ''),
      source: d.source,
      code: d.code,
      line: (d.range?.start?.line ?? 0) + 1,
      character: (d.range?.start?.character ?? 0) + 1
    }))
    if (list.length === 0) this.diagnostics.delete(p.uri)
    else this.diagnostics.set(p.uri, list)
    // R5: bump generation so passive-feedback waiters see fresh results
    this.diagGen.set(p.uri, (this.diagGen.get(p.uri) ?? 0) + 1)
  }
}

function guessLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.html': 'html'
  }
  return map[ext] || 'plaintext'
}

export function formatLspResult(operation: LspOperation, result: unknown): string {
  if (result == null) return `(no ${operation} result)`
  if (operation === 'hover') {
    const h = result as { contents?: unknown }
    return formatHoverContents(h.contents)
  }
  if (Array.isArray(result)) {
    if (result.length === 0) return `(no ${operation} results)`
    return result
      .slice(0, 40)
      .map((item, i) => `${i + 1}. ${formatLocationish(item)}`)
      .join('\n')
  }
  return formatLocationish(result)
}

export function formatDiagnosticsBlock(
  diags: readonly LspDiagnostic[]
): string {
  return formatDiagnostics(diags)
}

function formatHoverContents(contents: unknown): string {
  if (contents == null) return '(no hover)'
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents
      .map((c) => (typeof c === 'string' ? c : (c as { value?: string }).value || ''))
      .filter(Boolean)
      .join('\n')
  }
  if (typeof contents === 'object' && contents && 'value' in contents) {
    return String((contents as { value: string }).value)
  }
  return JSON.stringify(contents).slice(0, 4000)
}

function formatLocationish(item: unknown): string {
  if (!item || typeof item !== 'object') return String(item)
  const o = item as Record<string, unknown>
  if (typeof o.name === 'string' && o.name) {
    const namePart = `${o.name}${o.kind != null ? ` (kind ${o.kind})` : ''}`
    if (o.uri && o.range) {
      const r = o.range as { start?: { line?: number; character?: number } }
      const line = (r.start?.line ?? 0) + 1
      const ch = (r.start?.character ?? 0) + 1
      return `${namePart} @ ${o.uri}:${line}:${ch}`
    }
    if (o.location) return `${namePart} @ ${formatLocationish(o.location)}`
    return namePart
  }
  if (o.uri && o.range) {
    const r = o.range as { start?: { line?: number; character?: number } }
    const line = (r.start?.line ?? 0) + 1
    const ch = (r.start?.character ?? 0) + 1
    return `${o.uri}:${line}:${ch}`
  }
  if (o.targetUri && o.targetRange) {
    const r = o.targetRange as { start?: { line?: number } }
    return `${o.targetUri}:${(r.start?.line ?? 0) + 1}`
  }
  if (o.from || o.to) {
    const bits: string[] = []
    if (o.from) bits.push(`from ${formatLocationish(o.from)}`)
    if (o.to) bits.push(`to ${formatLocationish(o.to)}`)
    return bits.join(' → ') || JSON.stringify(item).slice(0, 300)
  }
  if (o.location) return formatLocationish(o.location)
  return JSON.stringify(item).slice(0, 300)
}
