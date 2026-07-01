/**
 * Voice pipeline type definitions.
 */

/** Voice conversation mode */
export type VoiceMode = 'vad' | 'ptt' | 'off'

/** Input channel mode */
export type InputChannel = 'dual' | 'voice-only' | 'text-only'

/** Voice pipeline state machine */
export type VoicePipelineState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** TTS engine type */
export type TtsEngineType = 'cosyvoice' | 'edge-tts' | 'local-sapi' | 'none'

/** ASR result from Python service */
export type AsrResult = {
  text: string
  confidence: number
  language: string
}

/** TTS synthesis request */
export type TtsRequest = {
  text: string
  emotionInstruction: string
  requestId?: string
}

/** Voice service health status */
export type VoiceHealthStatus = {
  asr_ready: boolean
  tts_ready: boolean
  tts_engine: TtsEngineType
  tts_model_loaded: boolean
  gpu_available: boolean
  gpu_name: string
  port: number
}

/** IPC channel names for voice pipeline */
export const VOICE_IPC = {
  /** renderer → main: mic audio chunk */
  AUDIO_CHUNK: 'voice:audio-chunk',
  /** main → renderer: ASR started/stopped listening */
  LISTENING: 'voice:listening',
  /** main → renderer: ASR transcript result */
  TRANSCRIPT: 'voice:transcript',
  /** main → renderer: ASR processing / TTS model loading */
  THINKING: 'voice:thinking',
  /** main → renderer: TTS audio data (WAV) */
  TTS_AUDIO: 'tts:audio',
  /** renderer → main: interrupt TTS */
  TTS_STOP: 'tts:stop',
  /** renderer → main: switch voice mode */
  VOICE_MODE: 'voice:mode',
  /** main → renderer: TTS engine status */
  ENGINE_STATUS: 'voice:engine-status'
} as const
