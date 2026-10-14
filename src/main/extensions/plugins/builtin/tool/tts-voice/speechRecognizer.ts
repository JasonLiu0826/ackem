/**
 * Engine-agnostic ASR contract.
 * v1: SherpaOnnxRecognizer (sidecar). Later: WhisperCppRecognizer.
 * UI / VoiceManager must not mention Zipformer / Paraformer / Whisper.
 */

export type SpeechEngineId = 'sherpa-onnx' | 'whisper-cpp' | 'python'

/** Settings page labels only. Concrete onnx files live in the model manifest. */
export type SpeechQualityTier = 'light' | 'standard' | 'accurate'

export type SpeechInitOpts = {
  /** Activated model root from ModelManager, not a guessed folder name. */
  modelsDir: string
  modelId: string
  language: 'zh' | 'en' | 'auto'
  sampleRate: 16000
  endpointing: EndpointingPolicy
}

/** VAD emits speech/silence. This policy owns `final`. */
export type EndpointingPolicy = {
  minSpeechDurationMs: number
  minSilenceDurationMs: number
  maxUtteranceDurationMs: number
}

export const DEFAULT_ENDPOINTING: EndpointingPolicy = {
  minSpeechDurationMs: 200,
  minSilenceDurationMs: 700,
  maxUtteranceDurationMs: 15000
}

export type RecognizerStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'listening'
  | 'stopping'
  | 'crashed'
  | 'restarting'
  | 'error'

export type SpeechPartial = {
  sessionId: number
  sequence: number
  text: string
  /** false = still changing; true = this phrase is frozen but utterance not done */
  stable: boolean
}

export type SpeechFinal = {
  sessionId: number
  sequence: number
  text: string
  /** Metadata only. v1 must not branch on this. */
  confidence?: number
  language?: string
}

export type SpeechError = {
  sessionId?: number
  sequence?: number
  message: string
  fatal: boolean
  status: RecognizerStatus
}

export type Unsubscribe = () => void

export interface SpeechRecognizer {
  readonly id: SpeechEngineId
  initialize(opts: SpeechInitOpts): Promise<void>
  /** Allocates a new sessionId. */
  start(): Promise<void>
  /** Keep sessionId. Drop in-flight stream so the next phrase is a new utterance. */
  resetUtterance(): void
  pushPcm16(pcm: Int16Array, sampleRate: number): void
  stop(): Promise<void>
  dispose(): Promise<void>
  getStatus(): RecognizerStatus
  onPartial(fn: (event: SpeechPartial) => void): Unsubscribe
  onFinal(fn: (event: SpeechFinal) => void): Unsubscribe
  onError(fn: (error: SpeechError) => void): Unsubscribe
}
