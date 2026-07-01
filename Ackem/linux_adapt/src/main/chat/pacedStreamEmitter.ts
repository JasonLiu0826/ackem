import type { WebContents } from 'electron'
import { notifyChatStreamStart } from '../openAiSseStream'
import { findSafeSentenceBreak } from './sentenceBubbleStream'
import { REPLY_INTER_SENTENCE_GAP_MS } from '../../shared/replyPacing'

const SPLIT_MARKER = '[SPLIT]'

/** 展示/持久化前去掉 LLM 节奏分隔符 */
export function stripSplitMarkers(text: string): string {
  return text.split(SPLIT_MARKER).join('').trim()
}

function delayMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

/** 下一段可完整展示的内容长度（整句或 [SPLIT] 标记） */
export function firstDisplayUnitLen(unsent: string): number {
  if (!unsent) return -1
  if (unsent.startsWith(SPLIT_MARKER)) return SPLIT_MARKER.length
  const splitAt = unsent.indexOf(SPLIT_MARKER)
  if (splitAt > 0) return splitAt
  const end = findSafeSentenceBreak(unsent)
  if (end > 0) return end
  return -1
}

export type PacedStreamEmitter = {
  onDelta: (delta: string) => void
  markDone: () => Promise<void>
}

export function createPacedStreamEmitter(
  webContents: WebContents,
  options: { gapMs?: number; signal?: AbortSignal } = {}
): PacedStreamEmitter {
  const gapMs = options.gapMs ?? REPLY_INTER_SENTENCE_GAP_MS
  const signal = options.signal
  let received = ''
  let sentLen = 0
  let streamStarted = false
  let streamDone = false
  let pumping = false
  let pendingPump = false
  /** 上一句已展示完毕，下一句到来前需等待 */
  let pauseBeforeNext = false
  /** 下一句 pump 开始时需新开 bubble */
  let openNextBubble = false

  let sentenceIndex = 0
  let bubbleOpen = false
  /** 当前 bubble 在 received 中的起始下标 */
  let bubbleSentStart = 0

  const emitStart = (): void => {
    if (streamStarted) return
    streamStarted = true
    notifyChatStreamStart(webContents)
  }

  const beginBubble = (newBubble: boolean): void => {
    skipSplitMarkers()
    webContents.send('chat:wave-start', {
      waveIndex: sentenceIndex,
      waveCount: 0,
      newBubble
    })
    bubbleOpen = true
    bubbleSentStart = sentLen
  }

  const finishBubble = (): void => {
    if (!bubbleOpen) return
    const text = stripSplitMarkers(received.slice(bubbleSentStart, sentLen))
    if (text) webContents.send('chat:replace', text)
    webContents.send('chat:wave-end', { waveIndex: sentenceIndex, text })
    bubbleOpen = false
    sentenceIndex += 1
  }

  const ensureBubbleOpen = (): void => {
    if (bubbleOpen) return
    beginBubble(sentenceIndex > 0)
  }

  const emitChunk = (chunk: string): void => {
    if (!chunk) return
    emitStart()
    ensureBubbleOpen()
    webContents.send('chat:chunk', chunk)
  }

  const skipSplitMarkers = (): void => {
    while (received.slice(sentLen).startsWith(SPLIT_MARKER)) {
      sentLen += SPLIT_MARKER.length
    }
  }

  const schedulePumpAfterGap = (): void => {
    openNextBubble = true
    setTimeout(() => {
      void pump()
    }, gapMs)
  }

  const pump = async (): Promise<void> => {
    if (pumping) {
      pendingPump = true
      return
    }
    pumping = true
    try {
      while (!signal?.aborted) {
        if (pauseBeforeNext) {
          pauseBeforeNext = false
          if (bubbleOpen) finishBubble()
          await delayMs(gapMs, signal)
        }

        if (openNextBubble || (!bubbleOpen && sentLen < received.length)) {
          openNextBubble = false
          beginBubble(sentenceIndex > 0)
        }

        skipSplitMarkers()
        if (sentLen >= received.length) {
          if (streamDone) return
          return
        }

        const unsent = received.slice(sentLen)
        const unitLen = firstDisplayUnitLen(unsent)

        if (unitLen > 0) {
          emitChunk(unsent.slice(0, unitLen))
          sentLen += unitLen
          if (sentLen < received.length) {
            finishBubble()
            schedulePumpAfterGap()
            return
          }
          pauseBeforeNext = true
          return
        }

        if (!streamDone) {
          emitChunk(unsent)
          sentLen += unsent.length
          return
        }

        emitChunk(unsent)
        sentLen += unsent.length
        return
      }
    } finally {
      pumping = false
      if (pendingPump) {
        pendingPump = false
        await pump()
      }
    }
  }

  return {
    onDelta(delta: string) {
      received += delta
      void pump()
    },
    async markDone() {
      streamDone = true
      await pump()
      while (sentLen < received.length) {
        await delayMs(gapMs, signal)
        await pump()
      }
      if (bubbleOpen && sentLen > bubbleSentStart) {
        finishBubble()
      } else if (bubbleOpen) {
        bubbleOpen = false
      }
    }
  }
}
