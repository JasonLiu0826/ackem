/**
 * Voice pipeline manager — orchestrates ASR → Engine → TTS flow.
 *
 * State machine: idle → listening → thinking → speaking → idle
 * VAD: energy-based chunk buffering with silence flush (design §6.1).
 */

import { BrowserWindow, ipcMain } from 'electron'
import { pcmInt16RmsEnergy } from './audioWav'
import { TIER_TO_MODEL_ID } from './sherpa/catalog'
import { DEFAULT_ENDPOINTING } from './sherpa/endpointing'
import { speechModelManager } from './sherpa/modelManager'
import { SherpaOnnxRecognizer } from './sherpa/SherpaOnnxRecognizer'
import {
  checkVoiceEnvironment,
  installVoiceEnvironment,
  type InstallProgress
} from './voiceEnvironment'
import {
  DEFAULT_VOICE_RUNTIME_CONFIG,
  GPT_SOVITS_VOICE_ENABLED,
  TTS_BROADCAST_ENABLED,
  mergeVoiceRuntimeConfig,
  prepareTextForTts,
  type VoiceRuntimeConfig
} from './voiceRuntimeConfig'
import type { AsrPartial, InputChannel, VoiceHealthStatus, VoiceMode, VoicePipelineState } from './types'

const SPEECH_ENERGY_THRESHOLD = 0.012
const CHUNK_MS = 200

export class VoiceManager {
  private state: VoicePipelineState = 'idle'
  private mode: VoiceMode = 'off'
  private channel: InputChannel = 'dual'
  private config: VoiceRuntimeConfig = { ...DEFAULT_VOICE_RUNTIME_CONFIG }
  private currentTtsController: AbortController | null = null
  private ipcRegistered = false

  /** Utterance buffer (Int16 PCM chunks) */
  private utteranceChunks: Buffer[] = []
  private speechDetected = false
  private silenceMs = 0
  private interruptSpeechMs = 0
  private pttActive = false
  /** 剧院已打开且语音已启用 — 允许 TTS 即使未开麦 */
  private theaterSession = false
  private recognizer: SherpaOnnxRecognizer | null = null
  private sherpaStarting = false
  private loadedModelId: string | null = null

  get currentState(): VoicePipelineState {
    return this.state
  }

  get currentMode(): VoiceMode {
    return this.mode
  }

  get runtimeConfig(): VoiceRuntimeConfig {
    return { ...this.config }
  }

  get isTheaterSession(): boolean {
    return this.theaterSession
  }

  /** 剧院模式：开麦可选，但 LLM 回复应能 TTS 播报 */
  setTheaterSession(active: boolean): void {
    this.theaterSession = active
  }

  /** Register IPC handlers. Call once at plugin init. */
  registerIpc(): void {
    if (this.ipcRegistered) return
    this.ipcRegistered = true

    ipcMain.handle(
      'voice:audio-chunk',
      (
        _event,
        payload: ArrayBuffer | { pcm?: ArrayBuffer; sampleRate?: number; channels?: number }
      ) => {
        const pcm = payload instanceof ArrayBuffer ? payload : payload?.pcm
        if (pcm) void this.handleAudioChunk(pcm)
        return { ok: true }
      }
    )

    ipcMain.handle('voice:cancel-tts', () => {
      this.interrupt()
      return { ok: true }
    })

    ipcMain.handle('voice:set-mode', (_event, mode: VoiceMode) => {
      this.setMode(mode)
      return { ok: true }
    })

    ipcMain.handle('voice:set-input-channel', (_event, channel: InputChannel) => {
      this.setInputChannel(channel)
      return { ok: true }
    })

    ipcMain.handle('voice:health', async () => {
      return await this.health()
    })

    ipcMain.handle('voice:apply-settings', (_event, patch: Partial<VoiceRuntimeConfig>) => {
      this.applySettings(patch)
      return { ok: true }
    })

    ipcMain.handle('voice:restart-service', async () => {
      const ok = await this.restartSherpa().catch(() => false)
      return { ok }
    })

    ipcMain.handle('voice:fresh-utterance', () => {
      if (this.mode !== 'off') this.recognizer?.resetUtterance()
      return { ok: true }
    })

    ipcMain.handle('voice:ptt-active', (_event, active: boolean) => {
      this.pttActive = Boolean(active)
      if (this.recognizer) {
        if (active) void this.recognizer.start()
        else void this.recognizer.stop()
      }
      return { ok: true }
    })

    ipcMain.handle('voice:check-environment', async () => {
      return await checkVoiceEnvironment()
    })

    ipcMain.handle('voice:install-environment', async (event) => {
      const wc = event.sender
      const result = await installVoiceEnvironment((progress: InstallProgress) => {
        if (!wc.isDestroyed()) {
          wc.send('voice:install-log', progress)
        }
      })
      return result
    })

    ipcMain.handle('voice:set-theater-session', (_event, active: boolean) => {
      this.setTheaterSession(Boolean(active))
      return { ok: true }
    })
  }

  async disposeRecognizer(): Promise<void> {
    await this.recognizer?.dispose()
    this.recognizer = null
    this.loadedModelId = null
  }

  /** Unregister IPC handlers. */
  unregisterIpc(): void {
    if (!this.ipcRegistered) return
    this.ipcRegistered = false
    for (const ch of [
      'voice:audio-chunk',
      'voice:cancel-tts',
      'voice:set-mode',
      'voice:set-input-channel',
      'voice:health',
      'voice:apply-settings',
      'voice:restart-service',
      'voice:fresh-utterance',
      'voice:ptt-active',
      'voice:check-environment',
      'voice:install-environment',
      'voice:set-theater-session'
    ]) {
      ipcMain.removeHandler(ch)
    }
  }

  applySettings(patch: Partial<VoiceRuntimeConfig>): void {
    if (!GPT_SOVITS_VOICE_ENABLED && patch.ttsEngine === 'gpt-sovits') {
      patch = { ...patch, ttsEngine: 'auto' }
    }
    if (!TTS_BROADCAST_ENABLED) {
      patch = { ...patch, ttsEnabled: false }
    }
    this.config = mergeVoiceRuntimeConfig({ ...this.config, ...patch })
    this.channel = this.config.inputChannel
    this.setPersonality(this.config.personalityPresetId)
    if (!this.config.enabled && this.mode !== 'off') {
      this.setMode('off')
    } else if (this.config.enabled) {
      void this.ensureSherpa()
    }
  }

  /** Set voice mode. */
  setMode(mode: VoiceMode): void {
    if (mode !== 'off' && !this.config.enabled) {
      this.mode = 'off'
      this.resetUtterance()
      this.setState('idle')
      return
    }
    this.mode = mode
    if (mode === 'off') {
      this.interrupt()
      this.resetUtterance()
      void this.recognizer?.stop()
      this.setState('idle')
    } else if (this.state === 'idle') {
      this.setState('listening')
      void this.ensureSherpa().then(() => {
        if (this.mode !== 'ptt') void this.recognizer?.start()
      })
    }
  }

  /** Set input channel mode. */
  setInputChannel(channel: InputChannel): void {
    this.channel = channel
    this.config.inputChannel = channel
  }

  /** Set personality for emotion instruction modifier. */
  setPersonality(personality: string): void {
    this.config.personalityPresetId = personality
  }

  /** Interrupt current TTS playback. */
  interrupt(): void {
    if (this.currentTtsController) {
      this.currentTtsController.abort()
      this.currentTtsController = null
    }
    this.broadcastBrowserTtsCancel()
    if (this.state === 'speaking') {
      this.setState(this.mode === 'off' ? 'idle' : 'listening')
    }
    this.interruptSpeechMs = 0
  }

  /**
   * Speak text with emotion-driven TTS.
   * Called after LLM response completes.
   */
  async speak(text: string, emotionLabel: string): Promise<void> {
    if (!TTS_BROADCAST_ENABLED || !this.config.enabled || !this.config.ttsEnabled) return
    const spoken = prepareTextForTts(text)
    if (!spoken) return

    this.interrupt()
    this.setState('speaking')
    this.broadcastThinking(true)

    void emotionLabel
    const controller = new AbortController()
    this.currentTtsController = controller
    this.broadcastBrowserTts(spoken)
    this.broadcastThinking(false)
    this.currentTtsController = null
    this.setState(this.mode === 'off' ? 'idle' : 'listening')
  }

  private broadcastBrowserTts(text: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('voice:tts-speak-text', { text })
      }
    }
  }

  private broadcastBrowserTtsCancel(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('voice:tts-speak-cancel')
      }
    }
  }

  /** Handle audio chunk from renderer (mic input). */
  private async handleAudioChunk(audioData: ArrayBuffer): Promise<void> {
    if (this.mode === 'off' || !this.config.enabled) return

    const pcm = new Int16Array(audioData)
    if (pcm.length === 0) return

    const energy = pcmInt16RmsEnergy(pcm)
    const chunkMs = CHUNK_MS

    if (this.mode === 'ptt' && !this.pttActive) return

    if (this.state === 'speaking') {
      if (energy >= SPEECH_ENERGY_THRESHOLD) {
        this.interruptSpeechMs += chunkMs
        if (this.interruptSpeechMs >= this.config.interruptThresholdMs) {
          this.interrupt()
          this.recognizer?.pushPcm16(pcm, 16000)
          this.broadcastListening(true)
        }
      } else {
        this.interruptSpeechMs = 0
      }
      return
    }

    this.recognizer?.pushPcm16(pcm, 16000)
    if (energy >= SPEECH_ENERGY_THRESHOLD) this.broadcastListening(true)
    if (this.state !== 'thinking') this.setState('listening')
  }

  private resetUtterance(): void {
    this.utteranceChunks = []
    this.speechDetected = false
    this.silenceMs = 0
    this.interruptSpeechMs = 0
    this.broadcastListening(false)
  }

  private broadcastListening(active: boolean): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('voice:listening', active)
    }
  }

  private broadcastThinking(active: boolean): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('voice:thinking', active)
    }
  }

  private setState(state: VoicePipelineState): void {
    if (this.state === state) return
    this.state = state
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('voice:state', state)
    }
  }

  async health(): Promise<VoiceHealthStatus> {
    const workerStatus = this.recognizer?.getStatus()
    const sherpaLive = workerStatus === 'ready' || workerStatus === 'listening'
    return {
      asr_ready: sherpaLive,
      tts_ready: false,
      tts_engine: 'none',
      tts_model_loaded: false,
      gpu_available: false,
      gpu_name: '',
      port: 0,
      asr_engine: 'sherpa-onnx',
      workerStatus
    }
  }

  private currentModelId(): string {
    return TIER_TO_MODEL_ID.standard
  }

  private async ensureSherpa(): Promise<boolean> {
    if (this.sherpaStarting) return Boolean(this.recognizer)
    const modelId = this.currentModelId()
    const ready = await speechModelManager.verifyReady(modelId)
    if (!ready || !speechModelManager.runtimeHasSherpa()) {
      return false
    }
    if (this.recognizer && (this.recognizer.getStatus() === 'ready' || this.recognizer.getStatus() === 'listening')) {
      if (this.loadedModelId === modelId) return true
      await this.recognizer.dispose()
      this.recognizer = null
      this.loadedModelId = null
    }
    this.sherpaStarting = true
    try {
      const created = !this.recognizer
      const rec = this.recognizer ?? new SherpaOnnxRecognizer()
      this.recognizer = rec
      if (created) {
        rec.onPartial((e) => this.broadcastPartial(e))
        rec.onFinal((e) => {
          this.broadcastFinal(e)
        })
        rec.onError((err) => {
          this.broadcastAsrError(err.message)
        })
      }
      await rec.initialize({
        modelsDir: speechModelManager.modelsDir(),
        modelId,
        language: 'zh',
        sampleRate: 16000,
        endpointing: {
          ...DEFAULT_ENDPOINTING,
          minSilenceDurationMs: Math.max(600, this.config.silenceThresholdMs || 700)
        }
      })
      this.loadedModelId = modelId
      return true
    } catch (err) {
      console.error('[voiceManager] sherpa init failed:', err)
      this.broadcastAsrError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      this.sherpaStarting = false
    }
  }

  private async restartSherpa(): Promise<boolean> {
    await this.disposeRecognizer()
    return this.ensureSherpa()
  }

  private broadcastPartial(e: AsrPartial): void {
    this.broadcastListening(true)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('voice:transcript-partial', e)
    }
  }

  private broadcastFinal(e: { text: string; sessionId: number; sequence: number; confidence?: number; language?: string }): void {
    const text = e.text.trim()
    if (!text) return
    this.broadcastListening(false)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('voice:transcript', {
          text,
          confidence: e.confidence ?? 0,
          language: e.language ?? 'zh',
          sessionId: e.sessionId,
          sequence: e.sequence
        })
      }
    }
  }

  private broadcastAsrError(message: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('voice:asr-error', { message })
    }
  }
}

export const voiceManager = new VoiceManager()

/** Fire TTS after a chat turn if voice pipeline is active. */
export async function speakAssistantReplyIfVoiceActive(args: {
  assistantText: string
  emotionLabel: string
  personalityPresetId?: string
}): Promise<void> {
  const cfg = voiceManager.runtimeConfig
  if (!TTS_BROADCAST_ENABLED || !cfg.enabled || !cfg.ttsEnabled) return
  if (voiceManager.currentMode === 'off' && !voiceManager.isTheaterSession) return
  if (args.personalityPresetId) {
    voiceManager.applySettings({ personalityPresetId: args.personalityPresetId })
  }
  await voiceManager.speak(args.assistantText, args.emotionLabel)
}
