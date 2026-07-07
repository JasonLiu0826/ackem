/**
 * Voice pipeline hook 鈥?mic capture + TTS playback for theater mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadVoiceSettings, syncVoiceSettingsToMain, TTS_BROADCAST_ENABLED } from '../lib/voiceSettings'
import { useUiStore } from '../store/uiStore'

const SAMPLE_RATE = 16000

type VoicePipelineState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'error'

export function useVoicePipeline() {
  const [state, setState] = useState<VoicePipelineState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [micActive, setMicActive] = useState(false)

  const setVoiceListening = useUiStore((s) => s.setVoiceListening)
  const settingsRef = useRef(loadVoiceSettings())

  const streamRef = useRef<MediaStream | null>(null)
  const captureContextRef = useRef<AudioContext | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const audioUnlockedRef = useRef(false)
  const pttActiveRef = useRef(false)

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return
    const playback = playbackContextRef.current
    if (playback && playback.state === 'suspended') {
      void playback.resume()
    }
    const silentCtx = new AudioContext()
    const buffer = silentCtx.createBuffer(1, 1, silentCtx.sampleRate)
    const source = silentCtx.createBufferSource()
    source.buffer = buffer
    source.connect(silentCtx.destination)
    source.start()
    silentCtx.close()
    audioUnlockedRef.current = true
  }, [])

  const ensurePlaybackContext = useCallback(() => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext()
      gainRef.current = playbackContextRef.current.createGain()
      gainRef.current.gain.value = settingsRef.current.ttsVolume / 100
      gainRef.current.connect(playbackContextRef.current.destination)
    }
    return playbackContextRef.current
  }, [])

  const ensureCaptureContext = useCallback(() => {
    if (!captureContextRef.current) {
      captureContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    }
    return captureContextRef.current
  }, [])

  const syncSettings = useCallback(async () => {
    const s = loadVoiceSettings()
    settingsRef.current = s
    if (gainRef.current) {
      gainRef.current.gain.value = s.ttsVolume / 100
    }
    await syncVoiceSettingsToMain(s)
  }, [])

  const startListening = useCallback(async () => {
    const s = loadVoiceSettings()
    settingsRef.current = s
    if (!s.enabled) {
      setError('璇峰厛鍦ㄨ缃腑鍚敤璇煶鍔熻兘')
      setState('error')
      return
    }

    try {
      await syncSettings()
      unlockAudio()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      streamRef.current = stream

      const ctx = ensureCaptureContext()
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        const pcm = downsampleTo16k(inputData, ctx.sampleRate)
        const int16 = float32ToInt16(pcm)
        window.Ackem.voice?.sendAudioChunk(int16.buffer)
      }

      source.connect(processor)
      processor.connect(ctx.destination)
      processorRef.current = processor

      await window.Ackem.voice?.setMode?.(s.voiceMode)
      await window.Ackem.voice?.setInputChannel?.(s.inputChannel)

      setMicActive(true)
      setState('listening')
      setVoiceListening(true)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`楹﹀厠椋庤闂け璐? ${msg}`)
      setState('error')
    }
  }, [unlockAudio, ensureCaptureContext, setVoiceListening, syncSettings])

  const stopListening = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect()
      } catch {
        // ignore
      }
      processorRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    void window.Ackem.voice?.setMode?.('off')
    void window.Ackem.voice?.setPttActive?.(false)
    pttActiveRef.current = false
    setMicActive(false)
    setState('idle')
    setVoiceListening(false)
  }, [setVoiceListening])

  const playTts = useCallback(
    async (audioBuffer: ArrayBuffer) => {
      try {
        unlockAudio()
        const ctx = ensurePlaybackContext()
        if (ctx.state === 'suspended') {
          await ctx.resume()
        }
        if (gainRef.current) {
          gainRef.current.gain.value = settingsRef.current.ttsVolume / 100
        }
        const copy = audioBuffer.slice(0)
        const audioBufferDecoded = await ctx.decodeAudioData(copy)

        if (ttsSourceRef.current) {
          try {
            ttsSourceRef.current.stop()
          } catch {
            // ignore
          }
        }

        const source = ctx.createBufferSource()
        source.buffer = audioBufferDecoded
        source.connect(gainRef.current ?? ctx.destination)
        source.onended = () => {
          if (ttsSourceRef.current === source) {
            ttsSourceRef.current = null
            setState(micActive ? 'listening' : 'idle')
          }
        }
        ttsSourceRef.current = source
        setState('speaking')
        source.start()
      } catch (err) {
        console.error('[voice] TTS playback error:', err)
        setState(micActive ? 'listening' : 'idle')
      }
    },
    [ensurePlaybackContext, unlockAudio, micActive]
  )

  const interrupt = useCallback(() => {
    if (ttsSourceRef.current) {
      try {
        ttsSourceRef.current.stop()
      } catch {
        // ignore
      }
      ttsSourceRef.current = null
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    window.Ackem.voice?.cancelTts()
    setState(micActive ? 'listening' : 'idle')
  }, [micActive])

  const speakBrowserTts = useCallback(
    async (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) {
        setState(micActive ? 'listening' : 'idle')
        return
      }
      unlockAudio()
      setState('speaking')
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.volume = Math.max(0, Math.min(1, settingsRef.current.ttsVolume / 100))
      const voices = window.speechSynthesis.getVoices()
      const zhVoice =
        voices.find((v) => v.lang.startsWith('zh-CN')) ??
        voices.find((v) => v.lang.startsWith('zh'))
      if (zhVoice) utterance.voice = zhVoice
      await new Promise<void>((resolve) => {
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        window.speechSynthesis.speak(utterance)
      })
      setState(micActive ? 'listening' : 'idle')
    },
    [unlockAudio, micActive]
  )

  const toggleMic = useCallback(() => {
    if (micActive) {
      stopListening()
    } else {
      void startListening()
    }
  }, [micActive, startListening, stopListening])

  const setPttActive = useCallback((active: boolean) => {
    pttActiveRef.current = active
    void window.Ackem.voice?.setPttActive?.(active)
  }, [])

  useEffect(() => {
    void syncSettings()
    return () => {
      stopListening()
      if (captureContextRef.current) {
        void captureContextRef.current.close()
        captureContextRef.current = null
      }
      if (playbackContextRef.current) {
        void playbackContextRef.current.close()
        playbackContextRef.current = null
      }
    }
  }, [stopListening, syncSettings])

  useEffect(() => {
    if (!TTS_BROADCAST_ENABLED) return
    const unsubTts = window.Ackem.voice?.onTtsAudio?.((audio: ArrayBuffer) => {
      void playTts(audio)
    })
    const unsubBrowserTts = window.Ackem.voice?.onTtsSpeakText?.(({ text }) => {
      void speakBrowserTts(text)
    })
    const unsubBrowserCancel = window.Ackem.voice?.onTtsSpeakCancel?.(() => {
      window.speechSynthesis?.cancel()
      setState(micActive ? 'listening' : 'idle')
    })
    return () => {
      unsubTts?.()
      unsubBrowserTts?.()
      unsubBrowserCancel?.()
    }
  }, [playTts, speakBrowserTts, micActive])

  useEffect(() => {
    const unsubState = window.Ackem.voice?.onStateChange?.((newState: string) => {
      if (newState === 'speaking' && !TTS_BROADCAST_ENABLED) return
      if (newState === 'speaking') setState('speaking')
      else if (newState === 'thinking') setState('thinking')
      else if (newState === 'listening' && micActive) setState('listening')
      else if (newState === 'idle' && micActive) setState('listening')
      else if (!micActive) setState('idle')
    })
    const unsubListening = window.Ackem.voice?.onListening?.((active: boolean) => {
      setVoiceListening(active)
    })
    const unsubThinking = window.Ackem.voice?.onThinking?.((active: boolean) => {
      if (active && micActive) setState('thinking')
    })
    return () => {
      unsubState?.()
      unsubListening?.()
      unsubThinking?.()
    }
  }, [micActive, setVoiceListening])

  return {
    state,
    error,
    micActive,
    startListening,
    stopListening,
    toggleMic,
    playTts,
    interrupt,
    unlockAudio,
    setPttActive,
    refreshSettings: syncSettings
  }
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === SAMPLE_RATE) return input
  const ratio = inputSampleRate / SAMPLE_RATE
  const newLength = Math.round(input.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const srcIndex = Math.round(i * ratio)
    result[i] = input[Math.min(srcIndex, input.length - 1)]
  }
  return result
}

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return output
}
