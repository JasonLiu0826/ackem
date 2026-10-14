import { type ChildProcess, spawn } from 'child_process'
import type {
  RecognizerStatus,
  SpeechError,
  SpeechFinal,
  SpeechInitOpts,
  SpeechPartial,
  SpeechRecognizer,
  Unsubscribe
} from '../speechRecognizer'
import { CrashLoopGuard } from './crashLoop'
import { createFrameParser, encodeControl, encodePcm16 } from './frame'
import type { ControlOut } from './protocol'
import { resolveWorkerNode } from './resolveNode'
import { speechModelManager } from './modelManager'
import { resolveWorkerScript, sherpaRuntimeRoot } from './workerPaths'

type Listener<T> = (event: T) => void

export class SherpaOnnxRecognizer implements SpeechRecognizer {
  readonly id = 'sherpa-onnx' as const

  private status: RecognizerStatus = 'stopped'
  private child: ChildProcess | null = null
  private opts: SpeechInitOpts | null = null
  private sessionId = 0
  private outSeq = 0
  private lastInSeq = -1
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private readonly crashes = new CrashLoopGuard()
  private readyWaiters: Array<(ok: boolean) => void> = []
  private wantListen = false
  private resumeAfterCrash = false
  private lastError: string | null = null

  private readonly partials = new Set<Listener<SpeechPartial>>()
  private readonly finals = new Set<Listener<SpeechFinal>>()
  private readonly errors = new Set<Listener<SpeechError>>()

  getStatus(): RecognizerStatus {
    return this.status
  }

  onPartial(fn: Listener<SpeechPartial>): Unsubscribe {
    this.partials.add(fn)
    return () => this.partials.delete(fn)
  }

  onFinal(fn: Listener<SpeechFinal>): Unsubscribe {
    this.finals.add(fn)
    return () => this.finals.delete(fn)
  }

  onError(fn: Listener<SpeechError>): Unsubscribe {
    this.errors.add(fn)
    return () => this.errors.delete(fn)
  }

  async initialize(opts: SpeechInitOpts): Promise<void> {
    this.opts = opts
    await this.spawnWorker()
  }

  async start(): Promise<void> {
    this.wantListen = true
    if (this.status === 'error') {
      this.crashes.recordReady()
      await this.spawnWorker()
    }
    if (this.status !== 'ready' && this.status !== 'listening') {
      if (this.status === 'stopped' || this.status === 'crashed') {
        await this.spawnWorker()
      }
    }
    this.sessionId += 1
    this.outSeq = 0
    this.lastInSeq = -1
    this.writeControl({ type: 'start', sessionId: this.sessionId })
    this.setStatus('listening')
  }

  resetUtterance(): void {
    if (this.status !== 'listening') return
    this.writeControl({ type: 'reset', sessionId: this.sessionId })
  }

  pushPcm16(pcm: Int16Array, _sampleRate: number): void {
    if (this.status !== 'listening' || !this.child?.stdin?.writable) return
    const buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    this.outSeq += 1
    this.child.stdin.write(encodePcm16(this.sessionId, this.outSeq, buf))
  }

  async stop(): Promise<void> {
    this.wantListen = false
    if (this.child?.stdin?.writable) {
      this.writeControl({ type: 'stop', sessionId: this.sessionId })
    }
    if (this.status === 'listening') this.setStatus('ready')
  }

  async dispose(): Promise<void> {
    this.wantListen = false
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.setStatus('stopping')
    await this.killWorker()
    this.setStatus('stopped')
  }

  private writeControl(obj: unknown): void {
    if (!this.child?.stdin?.writable) return
    this.outSeq += 1
    this.child.stdin.write(encodeControl(this.sessionId, this.outSeq, obj))
  }

  private setStatus(status: RecognizerStatus): void {
    this.status = status
  }

  private emitError(message: string, fatal: boolean): void {
    this.lastError = message
    const event: SpeechError = {
      sessionId: this.sessionId,
      message,
      fatal,
      status: this.status
    }
    for (const fn of this.errors) fn(event)
  }

  private handleControl(raw: ControlOut): void {
    if (raw.type === 'ready') {
      this.crashes.recordReady()
      this.setStatus('ready')
      for (const w of this.readyWaiters) w(true)
      this.readyWaiters = []
      if (this.wantListen && this.resumeAfterCrash) {
        this.resumeAfterCrash = false
        void this.start()
      }
      return
    }
    if (raw.type === 'error') {
      this.setStatus(raw.fatal ? 'error' : this.status)
      this.emitError(raw.message, Boolean(raw.fatal))
      if (raw.fatal) {
        for (const w of this.readyWaiters) w(false)
        this.readyWaiters = []
      }
      return
    }
    if (raw.type !== 'transcript') return
    if (raw.sessionId !== this.sessionId) return
    if (raw.sequence <= this.lastInSeq) return
    this.lastInSeq = raw.sequence
    if (raw.stage === 'partial') {
      const event: SpeechPartial = {
        sessionId: raw.sessionId,
        sequence: raw.sequence,
        text: raw.text,
        stable: raw.stable
      }
      for (const fn of this.partials) fn(event)
      return
    }
    const event: SpeechFinal = {
      sessionId: raw.sessionId,
      sequence: raw.sequence,
      text: raw.text,
      confidence: raw.confidence,
      language: raw.language
    }
    for (const fn of this.finals) fn(event)
  }

  private async spawnWorker(): Promise<void> {
    if (this.status === 'starting') {
      await new Promise<boolean>((resolve) => this.readyWaiters.push(resolve))
      return
    }
    await this.killWorker()
    if (!this.opts) throw new Error('recognizer not initialized')

    const script = resolveWorkerScript()
    const node = resolveWorkerNode()
    this.setStatus('starting')

    const child = spawn(node, [script], {
      cwd: sherpaRuntimeRoot(),
      env: {
        ...process.env,
        NODE_PATH: speechModelManager.runtimeModuleDir(),
        ELECTRON_RUN_AS_NODE: ''
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.child = child

    const parse = createFrameParser((frame) => {
      if (frame.kind !== 1) return
      try {
        this.handleControl(JSON.parse(frame.payload.toString('utf8')) as ControlOut)
      } catch {
        // ignore malformed control
      }
    })
    child.stdout?.on('data', parse)
    child.stderr?.on('data', (b: Buffer) => {
      const line = b.toString().trim()
      if (line) console.warn('[sherpa-worker]', line)
    })
    child.on('exit', (code) => {
      if (this.child !== child) return
      this.child = null
      if (this.status === 'stopping' || this.status === 'stopped') return
      this.setStatus('crashed')
      this.resumeAfterCrash = this.wantListen
      const next = this.crashes.recordCrash()
      if (next.action === 'error') {
        this.setStatus('error')
        this.emitError('本地语音服务异常（连续崩溃已停止重启）', true)
        return
      }
      this.setStatus('restarting')
      this.emitError('识别进程退出，正在重启…', false)
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        void this.spawnWorker().catch((err) => {
          this.setStatus('error')
          this.emitError(String(err), true)
        })
      }, next.delayMs)
    })

    this.writeControl({
      type: 'init',
      modelId: this.opts.modelId,
      modelsDir: this.opts.modelsDir,
      language: this.opts.language,
      endpointing: this.opts.endpointing
    })

    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 20_000)
      this.readyWaiters.push((ready) => {
        clearTimeout(timer)
        resolve(ready)
      })
    })
    if (!ok && this.status !== 'error' && this.status !== 'restarting') {
      this.setStatus('error')
      this.emitError(this.lastError ?? '识别进程启动超时', true)
      throw new Error(this.lastError ?? '识别进程启动超时')
    }
  }

  private async killWorker(): Promise<void> {
    const child = this.child
    this.child = null
    if (!child) return
    try {
      if (child.stdin?.writable) {
        child.stdin.write(encodeControl(0, 0, { type: 'shutdown' }))
      }
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // ignore
        }
        resolve()
      }, 800)
      child.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }
}
