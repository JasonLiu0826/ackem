import type { WebContents } from 'electron'
import { notifyChatStreamStart } from '../openAiSseStream'
import { findSafeSentenceBreak } from './sentenceBubbleStream'
import {
  findBreakAfter,
  findSoftBreak,
  looksLikeStructuredContent,
  RUNON_BUDGET_PUNCTUATED,
  RUNON_LOOKAHEAD,
  RUNON_SENTENCE_CAP,
  runOnBudget,
  stripTrailingSeparators
} from './humanizeReply'
import { REPLY_INTER_SENTENCE_GAP_MS } from '../../shared/replyPacing'

const SPLIT_MARKER = '[SPLIT]'

const TRAILING_SEPARATORS_RE = /[，,、；;：:\s]+$/u

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
  /** 当前 bubble 实际推下去的文字（补标点 / 去尾逗号以它为准） */
  let bubbleText = ''
  /** 任务型内容（代码/表格/列表/链接）不拆条 */
  let structured = false

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
    bubbleText = ''
  }

  const finishBubble = (): void => {
    if (!bubbleOpen) return
    const raw = bubbleText || received.slice(bubbleSentStart, sentLen)
    const cleaned = stripTrailingSeparators(stripSplitMarkers(raw))
    // 极端情况：整条只有标点，别把气泡清空
    const text = cleaned || stripSplitMarkers(raw)
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
    bubbleText += chunk
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

        // 结构化内容（代码块/表格/列表/链接/行内代码）一出现就锁死"不自动拆条"。
        // 必须尽早判断：等收到 80 字再判，小代码块已经被切碎了。
        if (!structured && looksLikeStructuredContent(received)) {
          structured = true
        }

        const unitLen = firstDisplayUnitLen(unsent)

        if (unitLen > 0) {
          // 整句特别长（模型又写飞了）：先按预算在逗号/分句尾处切开，别整句塞一条
          if (unitLen >= RUNON_SENTENCE_CAP) {
            const soft = findSoftBreak(unsent, RUNON_BUDGET_PUNCTUATED)
            if (soft && soft.index > 0 && soft.index < unitLen) {
              const piece = unsent.slice(0, soft.index).replace(TRAILING_SEPARATORS_RE, '')
              if (piece) {
                emitChunk(piece)
                sentLen += soft.index
                finishBubble()
                schedulePumpAfterGap()
                return
              }
            }
          }
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

        // 句末标点一直没出现（模型整段不喘气）：断开成下一条短消息。
        if (!structured) {
          // ① 当前气泡已经到预算（没标点 24 字 / 有逗号 34 字）：先暂缓吐字，
          //    等后面一小段上下文，好在标点 / 转折词 / 分句尾字上断开，
          //    而不是硬切在词中间。字不会丢（sentLen 没动）。
          const budget = runOnBudget(bubbleText)
          if (bubbleText.length >= budget) {
            const combined = bubbleText + unsent
            // 流已结束、只剩几个字：并进当前气泡，别留「霉透了」这种 3 字尾巴
            if (streamDone && unsent.length <= 6) {
              emitChunk(unsent)
              sentLen += unsent.length
              return
            }
            const breakAt = findBreakAfter(combined, bubbleText.length)
            if (breakAt > 0) {
              const emitLen = breakAt - bubbleText.length
              // 切点可能正好落在逗号后面：吐出去之前先剥掉，别让这条以「，」收尾
              emitChunk(stripTrailingSeparators(unsent.slice(0, emitLen)))
              sentLen += emitLen
              finishBubble()
              schedulePumpAfterGap()
              return
            }
            if (!streamDone && combined.length < budget + RUNON_LOOKAHEAD) {
              return
            }
            // 再也等不到像样的切点：按已显示内容收尾
            finishBubble()
            schedulePumpAfterGap()
            return
          }

          // ② 未发送部分本身已经很长大段（模型整段吐出）：在软断点处切开
          const limit = runOnBudget(unsent)
          if (unsent.length >= limit) {
            const soft = findSoftBreak(unsent, limit)
            if (soft) {
              const piece = unsent.slice(0, soft.index).replace(TRAILING_SEPARATORS_RE, '')
              if (piece) {
                emitChunk(piece)
                sentLen += soft.index
                finishBubble()
                schedulePumpAfterGap()
                return
              }
            }
          }
        }

        // 流快结束了、只剩几个字：并进当前气泡，别留「霉透了」这种 3 字尾巴
        if (streamDone && bubbleOpen && unsent.length <= 6) {
          emitChunk(unsent)
          sentLen += unsent.length
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
