/**
 * Model catalog. VoiceManager never downloads or guesses onnx filenames.
 * Concrete files can change; ids (zh-standard) stay stable.
 */

export type SpeechModelType = 'streaming-asr' | 'vad' | 'kws' | 'tts'

export type SpeechModelFile = {
  name: string
  sha256: string
  bytes: number
  url?: string
}

export type SpeechModelManifest = {
  id: string
  engine: 'sherpa-onnx' | 'whisper-cpp'
  type: SpeechModelType
  language: 'zh' | 'en' | 'auto'
  sampleRate: 16000
  files: SpeechModelFile[]
}

export type ModelManager = {
  list(): Promise<SpeechModelManifest[]>
  download(id: string): Promise<void>
  verify(id: string): Promise<boolean>
  delete(id: string): Promise<void>
  activate(id: string): Promise<void>
  activeId(): string | null
  modelsDir(): string
}
