/**
 * Voice pipeline manager — orchestrates ASR → Engine → TTS flow.
 *
 * State machine: idle → listening → thinking → speaking → idle
 * VAD: energy-based chunk buffering with silence flush (design §6.1).
 */

import { BrowserWindow, ipcMain } from 'electron'
import { pcmInt16RmsEnergy, pcmInt16ToWav } from './audioWav'
import { getEmotionInstruction } from './emotionVoiceMap'
import { voiceService } from './pythonService'
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
import type { InputChannel, VoiceMode, VoicePipelineState } from './types'

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
  private asrInFlight = false
  /** 剧院已打开且语音已启用 — 允许 TTS 即使未开麦 */
  private theaterSession = false

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

    ipcMain.handle('voice:audio-chunk', (_event, buffer: ArrayBuffer) => {
      void this.handleAudioChunk(buffer)
      return { ok: true }
    })

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
      return await voiceService.health()
    })

    ipcMain.handle('voice:apply-settings', (_event, patch: Partial<VoiceRuntimeConfig>) => {
      this.applySettings(patch)
      return { ok: true }
    })

    ipcMain.handle('voice:restart-service', async () => {
      const ok = await voiceService.restart({ ttsEngine: this.config.ttsEngine })
      return { ok }
    })

    ipcMain.handle('voice:ptt-active', (_event, active: boolean) => {
      this.pttActive = Boolean(active)
      if (!active && this.mode === 'ptt') {
        void this.flushUtterance()
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
      'voice:ptt-active',
      'voice:check-environment',
      'voice:install-environment',
      'voice:set-theater-session'
    ]) {
      ipcMain.removeHandler(ch)
    }
  }

  applySettings(patch: Partial<VoiceRuntimeConfig>): void {
    const prevEngine = this.config.ttsEngine
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
    }
    if (patch.ttsEngine !== undefined && patch.ttsEngine !== prevEngine) {
      void voiceService.restart({ ttsEngine: this.config.ttsEngine })
    } else if (patch.ttsPiperModel !== undefined && this.config.ttsEngine === 'piper') {
      void voiceService.restart({ ttsEngine: 'piper' })
    } else if (
      patch.ttsGptSovitsModel !== undefined &&
      this.config.ttsEngine === 'gpt-sovits'
    ) {
      void voiceService.restart({ ttsEngine: 'gpt-sovits' })
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
      this.setState('idle')
    } else if (this.state === 'idle') {
      this.setState('listening')
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
    void voiceService.cancelTts()
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

    const instruction = getEmotionInstruction(emotionLabel, this.config.personalityPresetId)
    const controller = new AbortController()
    this.currentTtsController = controller
    let usedBrowserFallback = false

    try {
      const voiceArg =
        this.config.ttsEngine === 'piper'
          ? this.config.ttsPiperModel
          : this.config.ttsEngine === 'gpt-sovits'
            ? this.config.ttsGptSovitsModel
            : this.config.ttsVoice
      const synthTimeoutMs = this.config.ttsEngine === 'gpt-sovits' ? 120_000 : undefined
      const audio = await voiceService.synthesize(
        spoken,
        instruction,
        voiceArg,
        synthTimeoutMs
      )
      if (controller.signal.aborted) return
      if (!audio || audio.byteLength < 44) {
        console.warn(
          '[voiceManager] TTS synthesize returned empty audio, using browser speechSynthesis fallback'
        )
        this.broadcastBrowserTts(spoken)
        usedBrowserFallback = true
        return
      }

      const payload = new Uint8Array(audio)
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('voice:tts-audio', payload)
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('[voiceManager] TTS error:', err)
        this.broadcastBrowserTts(spoken)
        usedBrowserFallback = true
      }
    } finally {
      this.broadcastThinking(false)
      if (this.currentTtsController === controller) {
        this.currentTtsController = null
        if (this.state === 'speaking' && !usedBrowserFallback) {
          this.setState(this.mode === 'off' ? 'idle' : 'listening')
        }
      }
    }
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
          this.utteranceChunks.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))
          this.speechDetected = true
          this.silenceMs = 0
          this.broadcastListening(true)
        }
      } else {
        this.interruptSpeechMs = 0
      }
      return
    }

    if (this.asrInFlight) return

    if (energy >= SPEECH_ENERGY_THRESHOLD) {
      this.utteranceChunks.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))
      this.speechDetected = true
      this.silenceMs = 0
      this.broadcastListening(true)
      if (this.state !== 'thinking') {
        this.setState('listening')
      }
      return
    }

    if (!this.speechDetected) return

    this.silenceMs += chunkMs
    this.utteranceChunks.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))

    if (this.silenceMs >= this.config.silenceThresholdMs) {
      await this.flushUtterance()
    }
  }

  private resetUtterance(): void {
    this.utteranceChunks = []
    this.speechDetected = false
    this.silenceMs = 0
    this.interruptSpeechMs = 0
    this.broadcastListening(false)
  }

  private async flushUtterance(): Promise<void> {
    if (this.asrInFlight || !this.speechDetected) {
      this.resetUtterance()
      return
    }

    const pcm = Buffer.concat(this.utteranceChunks)
    this.resetUtterance()

    if (pcm.length < 3200) return // < 100ms at 16kHz

    this.asrInFlight = true
    this.setState('thinking')
    this.broadcastThinking(true)

    try {
      const wav = pcmInt16ToWav(pcm)
      const result = await voiceService.transcribe(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength))
      if (result?.text.trim()) {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('voice:transcript', result)
        }
      }
    } catch (err) {
      console.error('[voiceManager] ASR error:', err)
    } finally {
      this.asrInFlight = false
      this.broadcastThinking(false)
      if (this.mode !== 'off') {
        this.setState('listening')
      } else {
        this.setState('idle')
      }
    }
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
