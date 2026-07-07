import { loadSettings } from '../../settings'
import { loadState, saveState } from '../../engine/state-persistence'
import { createLogger } from '../../logger'
import {
  ensureActivityBaselines,
  recordProactiveSent,
  recordWeixinAckemActivity
} from './activity'
import { evaluateWeixinProactiveGate } from './proactiveGate'
import { composeWeixinProactiveMessage } from './proactiveMessage'
import { planWeixinDelivery } from './deliveryPlanner'
import { sendWeixinOutboundSequence } from './outboundSequence'
import { enqueuePeerTurn } from './queue'
import {
  listWeixinPeers,
  loadContextToken,
  loadWeixinAccount,
  normalizePeerSessionId
} from './store'
import type { WeixinMonitorHandle } from './monitor'

const log = createLogger('weixin-proactive')

const TICK_MS = 15 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false

function isProactiveEnabled(settings: ReturnType<typeof loadSettings>): boolean {
  if (settings.weixinChannelEnabled === false) return false
  if (settings.weixinProactiveEnabled === false) return false
  return true
}

async function tickProactive(dataRoot: string, isPolling: () => boolean): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const settings = loadSettings()
    if (!isProactiveEnabled(settings)) return
    if (!isPolling()) return

    const gate = evaluateWeixinProactiveGate(dataRoot)
    if (!gate.ok) return

    const account = loadWeixinAccount(dataRoot)
    if (!account?.token) return

    const peers = listWeixinPeers(dataRoot)
    if (peers.length === 0) return

    const peer = peers[0]!
    const composed = await composeWeixinProactiveMessage({
      dataRoot,
      settings,
      peerId: peer.peerId
    })
    if (!composed) return

    const sessionId = normalizePeerSessionId(peer.peerId)
    const state = loadState(dataRoot, sessionId)
    const hints = {
      presetId: settings.personalityPresetId,
      aro: state?.emotion.aro ?? 0,
      aff: state?.emotion.aff ?? 0,
      intensity: 0
    }

    const bubbles = planWeixinDelivery({
      rawAssistant: composed.raw,
      presetId: hints.presetId,
      userText: '',
      emotion: { aro: hints.aro, aff: hints.aff },
      rng: () => 0.35
    })

    if (bubbles.length === 0) return

    const contextToken = loadContextToken(dataRoot, peer.peerId) ?? undefined

    await enqueuePeerTurn(peer.peerId, async () => {
      await sendWeixinOutboundSequence({
        account,
        peerId: peer.peerId,
        contextToken,
        bubbles,
        dataRoot
      })
      recordWeixinAckemActivity(dataRoot)
      recordProactiveSent(dataRoot)

      if (state) {
        state.counters.totalTurns = (state.counters?.totalTurns ?? 0) + 1
        saveState(dataRoot, state, sessionId)
      }
    })

    log.info('proactive sent', {
      peerId: peer.peerId.slice(0, 24),
      kind: composed.kind,
      bubbles: bubbles.length
    })
  } catch (e) {
    log.warn('proactive tick failed', e)
  } finally {
    ticking = false
  }
}

export function startWeixinProactiveScheduler(
  dataRoot: string,
  monitorRef: () => WeixinMonitorHandle | null
): void {
  stopWeixinProactiveScheduler()
  ensureActivityBaselines(dataRoot)

  timer = setInterval(() => {
    void tickProactive(dataRoot, () => monitorRef()?.isRunning() ?? false)
  }, TICK_MS)

  void tickProactive(dataRoot, () => monitorRef()?.isRunning() ?? false)
  log.info('proactive scheduler started', { tickMs: TICK_MS })
}

export function stopWeixinProactiveScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
