import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyFinal,
  applyPartial,
  emptyTranscriptDraft,
  markUserEdited,
  startTranscriptDraft,
  type TranscriptDraft
} from '../../../shared/transcriptDraft'
import { loadVoiceSettings } from '../lib/voiceSettings'

export function useAsrDraft(opts: {
  getText: () => string
  setText: (text: string) => void
  onVoiceOnlyFinal: (text: string) => void
  enabled?: boolean
}): {
  recognizing: boolean
  onUserType: (text: string) => void
  beginListen: () => void
} {
  const draftRef = useRef<TranscriptDraft>(emptyTranscriptDraft())
  const optsRef = useRef(opts)
  optsRef.current = opts
  const enabled = opts.enabled !== false
  const [recognizing, setRecognizing] = useState(false)

  const beginListen = useCallback(() => {
    draftRef.current = startTranscriptDraft(optsRef.current.getText())
    setRecognizing(false)
  }, [])

  const onUserType = useCallback((text: string) => {
    const prev = draftRef.current
    draftRef.current = markUserEdited(prev, text)
    optsRef.current.setText(text)
    const shortened = text.length < prev.draft.length
    if (prev.draft.trim() && shortened) {
      void window.ackem.voice?.freshUtterance?.()
      window.setTimeout(() => {
        if (!draftRef.current.clearedText) return
        if (draftRef.current.state === 'listening' || !draftRef.current.draft.trim()) {
          draftRef.current = { ...draftRef.current, clearedText: '' }
        }
      }, 1000)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const unsubPartial = window.ackem.voice?.onTranscriptPartial?.((e) => {
      const next = applyPartial(draftRef.current, e.sessionId, e.sequence, e.text)
      if (next === draftRef.current) return
      draftRef.current = next
      setRecognizing(next.state === 'partial')
      if (next.draft !== optsRef.current.getText()) optsRef.current.setText(next.draft)
    })
    const unsubFinal = window.ackem.voice?.onTranscript?.((result) => {
      const sessionId = result.sessionId ?? 0
      const sequence = result.sequence ?? Date.now()
      const next = applyFinal(draftRef.current, sessionId, sequence, result.text)
      if (next !== draftRef.current) {
        draftRef.current = next
        setRecognizing(false)
        if (next.state !== 'user-edited' && next.draft !== optsRef.current.getText()) {
          optsRef.current.setText(next.draft)
        }
      }
      const channel = loadVoiceSettings().inputChannel
      if (channel === 'voice-only' && next.state === 'final' && next.draft.trim()) {
        optsRef.current.onVoiceOnlyFinal(next.draft.trim())
      }
    })
    const unsubErr = window.ackem.voice?.onAsrError?.((e) => {
      setRecognizing(false)
      void import('../store/appStore').then(({ useAppStore }) => {
        useAppStore.getState().pushToast(e.message)
      })
    })
    return () => {
      unsubPartial?.()
      unsubFinal?.()
      unsubErr?.()
    }
  }, [enabled])

  return { recognizing, onUserType, beginListen }
}
