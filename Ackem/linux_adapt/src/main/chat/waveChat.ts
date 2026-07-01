import type { WebContents } from 'electron'
import type { AppSettings } from '../settings'
import { finalizeTurnAfterStream } from '../postChatTurn'
import { notifyUiChatBubble } from '../uiWindow'
import { createLogger } from '../logger'
import type { WavePlan, WaveSpec } from '../../shared/wavePlan'
import { buildWaveMessages, type WaveBuildContext } from './buildWaveMessages'
import { selectWaveEndpoint } from './waveEndpoint'
import { awaitDeferredEnrich, clearDeferredEnrich } from './deferredContext'
import { TurnBubbleQueue } from './turnBubbleQueue'
import { createTurnDedupState } from './sentenceDedup'
import {
  createSentenceTurnState,
  joinEmittedWaveParts,
  streamAnthropicAsSentenceBubbles,
  streamOpenAiAsSentenceBubbles,
  type SentenceBubbleContext,
  type SentenceTurnState
} from './sentenceBubbleStream'

const log = createLogger('wave-chat')

const abortBySession = new Map<string, AbortController>()
const ENRICH_WAIT_MS = 800

export type WaveChatBody = {
  settings: AppSettings
  turnId?: string
  wavePlan: WavePlan
  waveContext: WaveBuildContext
  sessionId?: string
  intensityMod?: number
}

function abortPreviousSession(sessionId: string): AbortController {
  const prev = abortBySession.get(sessionId)
  if (prev) prev.abort()
  const controller = new AbortController()
  abortBySession.set(sessionId, controller)
  return controller
}

function delayMs(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

async function awaitEnrichWithCap(turnId: string, signal: AbortSignal): Promise<string> {
  const result = await Promise.race([
    awaitDeferredEnrich(turnId),
    delayMs(ENRICH_WAIT_MS, signal).then(() => '')
  ])
  return result
}

function makeBubbleCtx(
  queue: TurnBubbleQueue,
  dedup: ReturnType<typeof createTurnDedupState>,
  waveIndex: number,
  signal: AbortSignal,
  turnState: SentenceTurnState,
  waveCount: number,
  emittedParts: string[]
): SentenceBubbleContext {
  return {
    queue,
    dedup,
    waveIndex,
    signal,
    turnState,
    waveCount,
    emittedParts,
    waveBubbleOpen: false
  }
}

async function streamOneWave(
  queue: TurnBubbleQueue,
  dedup: ReturnType<typeof createTurnDedupState>,
  turnState: SentenceTurnState,
  wave: WaveSpec,
  wavePlan: WavePlan,
  waveContext: WaveBuildContext,
  settings: AppSettings,
  intensityMod: number,
  signal: AbortSignal,
  turnId: string | undefined,
  priorAssistantParts: string[]
): Promise<string> {
  if (wave.waveIndex >= 1 && turnId) {
    const enriched = await awaitEnrichWithCap(turnId, signal)
    if (enriched) waveContext.enrichedTierBBlock = enriched
  }

  const messages = buildWaveMessages(waveContext, wave, wavePlan.waveCount, priorAssistantParts)
  const endpoint = selectWaveEndpoint(wave.waveIndex, settings)
  const emittedParts: string[] = []
  const ctx = makeBubbleCtx(
    queue,
    dedup,
    wave.waveIndex,
    signal,
    turnState,
    wavePlan.waveCount,
    emittedParts
  )

  const runStream = async (ep: ReturnType<typeof selectWaveEndpoint>) => {
    if (ep.provider === 'anthropic') {
      return streamAnthropicAsSentenceBubbles(
        ctx,
        ep,
        messages as Array<{ role: string; content: string }>,
        intensityMod
      )
    }
    return streamOpenAiAsSentenceBubbles(ctx, ep, messages, settings, intensityMod)
  }

  try {
    return await runStream(endpoint)
  } catch (e) {
    if (wave.waveIndex === 0 && endpoint.isLocal) {
      log.warn('local wave0 failed, fallback to cloud', { error: String(e) })
      const cloud = selectWaveEndpoint(1, settings)
      return await runStream(cloud)
    }
    throw e
  }
}

export async function streamChatWaves(
  webContents: WebContents,
  body: Record<string, unknown>,
  dataRoot: string
): Promise<void> {
  const settings = body.settings as AppSettings
  const wavePlan = body.wavePlan as WavePlan
  const waveContext = body.waveContext as WaveBuildContext
  const turnId = typeof body.turnId === 'string' ? body.turnId : undefined
  const sessionId =
    (typeof body.sessionId === 'string' ? body.sessionId : waveContext.settings.activeSessionId) ?? 'default'
  const intensityMod = typeof body.intensityMod === 'number' ? body.intensityMod : 1.0
  const controller = abortPreviousSession(sessionId)
  const signal = controller.signal

  const queue = new TurnBubbleQueue(webContents, wavePlan.waveCount, signal)
  const dedup = createTurnDedupState()
  const turnState = createSentenceTurnState()
  const t = setTimeout(() => controller.abort(), settings.timeoutMs || 120_000)

  const runWave = async (wave: WaveSpec, priorAssistantParts: string[]): Promise<string> => {
    if (signal.aborted) return ''
    try {
      return (
        await streamOneWave(
          queue,
          dedup,
          turnState,
          wave,
          wavePlan,
          waveContext,
          settings,
          intensityMod,
          signal,
          turnId,
          priorAssistantParts
        )
      ).trim()
    } catch (e) {
      log.warn('wave failed', { waveIndex: wave.waveIndex, error: String(e) })
      return ''
    } finally {
      queue.markGenerationComplete(wave.waveIndex)
    }
  }

  try {
    const priorParts: string[] = []
    const waveTexts: string[] = []

    for (const wave of wavePlan.waves) {
      const text = await runWave(wave, priorParts)
      waveTexts[wave.waveIndex] = text
      if (text) priorParts.push(text)
    }

    await queue.waitUntilDisplayed()

    if (signal.aborted) return

    const assistantText =
      dedup.displayedSentences.length > 0
        ? dedup.displayedSentences.join('\n')
        : joinEmittedWaveParts(waveTexts.filter(Boolean))

    webContents.send('chat:done', { assistantText, turnId })
    notifyUiChatBubble({ text: assistantText, role: 'assistant' })
    void finalizeTurnAfterStream({ turnId, dataRoot, assistantText, settings })
  } catch (e) {
    if (!signal.aborted) {
      webContents.send('chat:error', e instanceof Error ? e.message : String(e))
    }
  } finally {
    clearTimeout(t)
    if (turnId) clearDeferredEnrich(turnId)
    if (abortBySession.get(sessionId) === controller) {
      abortBySession.delete(sessionId)
    }
  }
}

export function abortWaveChat(sessionId: string): void {
  abortBySession.get(sessionId)?.abort()
}
