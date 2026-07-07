/**
 * Python voice service HTTP client + process lifecycle management.
 *
 * - Starts/stops the Python voice-service subprocess
 * - Port discovery (8765 + auto-increment)
 * - Watchdog (10s health check, auto-restart up to 3 times)
 * - HTTP client for /transcribe, /synthesize, /cancel, /health
 */

import { ChildProcess } from 'child_process'
import {
  assertVoiceServiceScript,
  resolveVoicePythonLaunchSpec,
  spawnPythonScript,
  voiceServiceDirFromScript,
  type PythonLaunchSpec
} from './pythonResolve'
import { getVoiceServiceScriptPath, getVoiceUserModelsDir, getGptSovitsUserModelsDir, getGptSovitsHomeConfigPath } from './voicePaths'

const BASE_PORT = 8765
const MAX_PORT_TRIES = 10
const HEALTH_INTERVAL_MS = 30_000
const MAX_RESTARTS = 3
const REQUEST_TIMEOUT_MS = 30_000

export type HealthStatus = {
  asr_ready: boolean
  tts_ready: boolean
  tts_engine: 'cosyvoice' | 'edge-tts' | 'local-sapi' | 'piper' | 'gpt-sovits' | 'none'
  tts_model_loaded: boolean
  gpu_available: boolean
  gpu_name: string
  port: number
  piper_voices?: Array<{ id: string; label: string; language: string }>
  gpt_sovits_voices?: Array<{ id: string; label: string; language: string }>
}

export type VoiceServiceStartOptions = {
  ttsEngine?: 'auto' | 'cosyvoice' | 'edge-tts' | 'local-sapi' | 'piper' | 'gpt-sovits'
}

export type TranscribeResult = {
  text: string
  confidence: number
  language: string
}

export type ServiceState = 'stopped' | 'starting' | 'ready' | 'error'

export class PythonVoiceService {
  private process: ChildProcess | null = null
  private port: number = BASE_PORT
  private restartCount: number = 0
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private state: ServiceState = 'stopped'
  private stateListeners: Array<(state: ServiceState) => void> = []
  private baseUrl: string = ''
  private pythonSpec: PythonLaunchSpec | null = null
  private lastStartError: string | null = null
  private ttsEngine: VoiceServiceStartOptions['ttsEngine'] = 'auto'

  get currentState(): ServiceState {
    return this.state
  }

  get currentPort(): number {
    return this.port
  }

  get lastError(): string | null {
    return this.lastStartError
  }

  onStateChange(listener: (state: ServiceState) => void): () => void {
    this.stateListeners.push(listener)
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener)
    }
  }

  private setState(state: ServiceState): void {
    if (this.state === state) return
    this.state = state
    for (const listener of this.stateListeners) {
      try {
        listener(state)
      } catch {
        // ignore listener errors
      }
    }
  }

  async start(opts?: VoiceServiceStartOptions): Promise<boolean> {
    if (opts?.ttsEngine) {
      this.ttsEngine = opts.ttsEngine
    }
    if (this.state === 'ready' || this.state === 'starting') return true
    this.setState('starting')

    // Find available port
    this.port = await this.findPort()
    this.baseUrl = `http://127.0.0.1:${this.port}`

    // Locate Python service script
    const servicePath = getVoiceServiceScriptPath()
    try {
      assertVoiceServiceScript(servicePath)
    } catch (err) {
      this.lastStartError = err instanceof Error ? err.message : String(err)
      console.error('[voice-service]', this.lastStartError)
      this.setState('error')
      return false
    }

    this.pythonSpec = resolveVoicePythonLaunchSpec()

    try {
      this.process = spawnPythonScript(
        this.pythonSpec,
        servicePath,
        [
          '--port',
          String(this.port),
          '--tts-engine',
          this.ttsEngine ?? 'auto',
          '--voice-models-dir',
          getVoiceUserModelsDir(),
          '--gpt-sovits-pack-dir',
          getGptSovitsUserModelsDir(),
          '--gpt-sovits-home-file',
          getGptSovitsHomeConfigPath()
        ],
        {
          cwd: voiceServiceDirFromScript(servicePath),
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        }
      )

      this.process.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg && !isHealthAccessLogLine(msg)) console.log('[voice-service]', msg)
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg && !isHealthAccessLogLine(msg)) console.warn('[voice-service:err]', msg)
      })

      this.process.on('exit', (code) => {
        console.warn('[voice-service] exited with code', code)
        this.process = null
        if (this.state === 'ready' || this.state === 'starting') {
          this.handleCrash()
        }
      })

      this.process.on('error', (err) => {
        const hint =
          'ENOENT' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? '鏈壘鍒?Python銆俉indows 璇峰畨瑁?Python 3 骞剁‘淇?py -3 鍙敤锛涙垨鎵嬪姩杩愯 Ackem/voice-service/server.py'
            : String(err)
        this.lastStartError = hint
        console.error('[voice-service] spawn error:', err)
        console.error('[voice-service]', hint)
        this.setState('error')
      })

      // Wait for health check to pass
      const ready = await this.waitForReady(30_000)
      if (ready) {
        this.setState('ready')
        this.restartCount = 0
        this.lastStartError = null
        this.startWatchdog()
        return true
      }

      this.lastStartError =
        this.lastStartError ??
        '璇煶鏈嶅姟鍚姩瓒呮椂锛?0s锛夈€傝鍦ㄦ湰鏈烘墽琛? pip install -r Ackem/voice-service/requirements.txt'
      console.error('[voice-service]', this.lastStartError)
      this.setState('error')
      return false
    } catch (err) {
      console.error('[voice-service] start failed:', err)
      this.setState('error')
      return false
    }
  }

  async restart(opts?: VoiceServiceStartOptions): Promise<boolean> {
    await this.stop()
    return this.start(opts)
  }

  async stop(): Promise<void> {
    this.stopWatchdog()
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.setState('stopped')
  }

  async health(): Promise<HealthStatus | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!resp.ok) return null
      return (await resp.json()) as HealthStatus
    } catch {
      return null
    }
  }

  async transcribe(audioWav: ArrayBuffer): Promise<TranscribeResult | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/transcribe/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: audioWav,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      if (!resp.ok) return null
      return (await resp.json()) as TranscribeResult
    } catch (err) {
      console.error('[voice-service] transcribe error:', err)
      return null
    }
  }

  async synthesize(
    text: string,
    emotionInstruction: string = '',
    voice: string = '',
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<ArrayBuffer | null> {
    const MAX_RETRIES = 2
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch(`${this.baseUrl}/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            emotion_instruction: emotionInstruction,
            voice
          }),
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (!resp.ok) return null
        const audio = await resp.arrayBuffer()
        if (audio.byteLength > 0) return audio
        // Empty response 鈥?retry
        if (attempt < MAX_RETRIES) {
          console.warn('[voice-service] TTS returned empty, retrying (%d/%d)', attempt + 1, MAX_RETRIES)
          await new Promise((r) => setTimeout(r, 500))
        }
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          console.warn('[voice-service] TTS error, retrying (%d/%d): %s', attempt + 1, MAX_RETRIES, err)
          await new Promise((r) => setTimeout(r, 500))
        } else {
          console.error('[voice-service] synthesize failed after retries:', err)
        }
      }
    }
    return null
  }

  async cancelTts(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/cancel`, { method: 'POST' })
    } catch {
      // ignore
    }
  }

  // --- Private ---

  private async findPort(): Promise<number> {
    for (let p = BASE_PORT; p < BASE_PORT + MAX_PORT_TRIES; p++) {
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/health`, {
          signal: AbortSignal.timeout(1000)
        })
        if (resp.ok) {
          // Port already has a voice service running
          const data = (await resp.json()) as HealthStatus
          this.port = p
          return data.port
        }
      } catch {
        // Port not in use 鈥?good, we can use it
        return p
      }
    }
    return BASE_PORT
  }

  private async waitForReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const h = await this.health()
      if (h && h.asr_ready) return true
      await new Promise((r) => setTimeout(r, 1000))
    }
    return false
  }

  private handleCrash(): void {
    this.stopWatchdog()
    if (this.restartCount < MAX_RESTARTS) {
      this.restartCount++
      console.warn(
        `[voice-service] crashed, restarting (${this.restartCount}/${MAX_RESTARTS})...`
      )
      setTimeout(() => this.start(), 2000)
    } else {
      console.error('[voice-service] max restarts exceeded, giving up')
      this.setState('error')
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog()
    this.healthTimer = setInterval(async () => {
      const h = await this.health()
      if (!h && this.state === 'ready') {
        console.warn('[voice-service] health check failed')
        this.handleCrash()
      }
    }, HEALTH_INTERVAL_MS)
  }

  private stopWatchdog(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }
}

// Singleton
export const voiceService = new PythonVoiceService()

/** Uvicorn access lines for GET /health 鈥?filtered from Electron console (watchdog + Settings poll). */
function isHealthAccessLogLine(msg: string): boolean {
  return /"GET \/health HTTP\/1\.1"\s+200/.test(msg)
}
