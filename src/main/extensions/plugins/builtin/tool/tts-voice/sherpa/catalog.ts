import type { SpeechModelManifest } from '../modelManifest'

const RELEASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models'

/** Stable ids. Concrete archives can change without touching UI. */
export const SPEECH_MODEL_CATALOG: SpeechModelManifest[] = [
  {
    id: 'vad-silero',
    engine: 'sherpa-onnx',
    type: 'vad',
    language: 'auto',
    sampleRate: 16000,
    files: [
      {
        name: 'silero_vad.onnx',
        sha256: '',
        bytes: 2_000_000,
        url: `${RELEASE}/silero_vad.onnx`
      }
    ]
  },
  {
    id: 'zh-light',
    engine: 'sherpa-onnx',
    type: 'streaming-asr',
    language: 'zh',
    sampleRate: 16000,
    files: [
      {
        name: 'sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23.tar.bz2',
        sha256: '',
        bytes: 70_000_000,
        url: `${RELEASE}/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23.tar.bz2`
      }
    ]
  },
  {
    id: 'zh-standard',
    engine: 'sherpa-onnx',
    type: 'streaming-asr',
    language: 'zh',
    sampleRate: 16000,
    files: [
      {
        name: 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2',
        sha256: '',
        bytes: 200_000_000,
        url: `${RELEASE}/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2`
      }
    ]
  }
]

export const TIER_TO_MODEL_ID = {
  light: 'zh-light',
  standard: 'zh-standard',
  accurate: 'zh-standard'
} as const

export function catalogById(id: string): SpeechModelManifest | undefined {
  return SPEECH_MODEL_CATALOG.find((m) => m.id === id)
}

export const ASR_REQUIRED_NAMES = ['encoder', 'decoder', 'joiner', 'tokens'] as const
