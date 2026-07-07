import { useEffect, useState } from 'react'
import {
  isEmbeddingReadyForChat,
  type EmbeddingReadinessSnapshot,
} from '../lib/chatSend'

export function useEmbeddingReadiness() {
  const [embeddingReadiness, setEmbeddingReadiness] = useState<EmbeddingReadinessSnapshot | null>(
    null
  )

  useEffect(() => {
    let unsub: (() => void) | undefined
    void (async () => {
      try {
        const snap = await window.Ackem.embeddingReadiness()
        setEmbeddingReadiness(snap as EmbeddingReadinessSnapshot)
      } catch {
        /* ignore */
      }
      unsub = window.Ackem.onEmbeddingReadinessChanged((snap) => {
        setEmbeddingReadiness(snap as EmbeddingReadinessSnapshot)
      })
    })()
    return () => unsub?.()
  }, [])

  return {
    embeddingReadiness,
    embeddingChatReady: isEmbeddingReadyForChat(embeddingReadiness),
    showEmbeddingBanner:
      embeddingReadiness != null &&
      embeddingReadiness.phase !== 'ready' &&
      embeddingReadiness.phase !== 'degraded',
  }
}
