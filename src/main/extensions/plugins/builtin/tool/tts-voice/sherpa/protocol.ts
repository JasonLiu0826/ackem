/**
 * Length-prefixed frames on worker stdin/stdout.
 * Control payload = UTF-8 JSON. Audio payload = raw Int16 LE.
 * Never JSON-encode PCM samples.
 *
 * u32le magic 0x4D4B4341 ('ACKM')
 * u8    kind  1=control-json | 2=pcm16
 * u32le sessionId
 * u32le sequence
 * u32le payloadLen
 * bytes payload
 */

export const FRAME_MAGIC = 0x4d4b4341
export const FRAME_KIND_CONTROL = 1
export const FRAME_KIND_PCM16 = 2

export type VoiceAudioChunk = {
  sampleRate: 16000
  channels: 1
  pcm: ArrayBuffer
}

export type ControlIn =
  | {
      type: 'init'
      modelId: string
      modelsDir: string
      language: 'zh' | 'en' | 'auto'
      endpointing: {
        minSpeechDurationMs: number
        minSilenceDurationMs: number
        maxUtteranceDurationMs: number
      }
    }
  | { type: 'start'; sessionId: number }
  | { type: 'reset'; sessionId: number }
  | { type: 'stop'; sessionId: number }
  | { type: 'shutdown' }

export type TranscriptStage = 'partial' | 'final'

export type ControlOut =
  | { type: 'ready'; engine: 'sherpa-onnx'; modelId: string }
  | {
      type: 'transcript'
      stage: 'partial'
      sessionId: number
      sequence: number
      text: string
      stable: boolean
    }
  | {
      type: 'transcript'
      stage: 'final'
      sessionId: number
      sequence: number
      text: string
      confidence?: number
      language?: string
    }
  | {
      type: 'error'
      sessionId?: number
      sequence?: number
      message: string
      fatal?: boolean
    }
  | { type: 'pong' }
