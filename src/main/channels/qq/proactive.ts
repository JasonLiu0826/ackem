// [qq] — QQ 主动搭话（她先开口）
//
// 大肥鱼的核心体验之一是「会主动找你聊天」；微信渠道已有同名能力
// （weixin/proactiveScheduler + proactiveGate），QQ 这边此前只有开关没有实现。
// 这里补一条与微信同构、但门控更保守的调度：
//   - 必须显式打开 qqProactiveEnabled（默认关，避免半夜突然被找）
//   - 8:00–22:00 才发
//   - 双向空闲 3 小时以上才考虑，发完至少冷却 3 小时
//   - 只找最近聊过的人，不群发
//
// 文案复用 companion/proactiveCompose（同一套人格 / 记忆 / 情绪 / 关系门控），
// 拆条与表情包复用 QQ 已有的 outboundSequence + deliveryPlanner。

import { loadSettings } from '../../settings'
import { loadState, saveState } from '../../engine/state-persistence'
import { kvGet, kvSet } from '../../db/repos/kv'
import { composeCompanionProactiveMessage } from '../../companion/proactiveCompose'
import { planWeixinDelivery } from '../weixin/deliveryPlanner'
import { formatBubbleForWeixin } from '../markdownForChannel'
import { createLogger } from '../../logger'
import { sendQqOutboundSequence, type QqBubble } from './outboundSequence'
import { listQqPeers } from './store'
import { appendConversationAssistant, resolveConversationSessionId } from '../conversation'
import { getChannelOwner } from '../ownerGate'
import { broadcastToRenderers } from '../../rendererBroadcast'
import type { OneBotClient } from './onebot'

const log = createLogger('qq-proactive')

const NS = 'qq_proactive'
const KEY_INBOUND = 'last_inbound_ms'
const KEY_SENT = 'last_sent_ms'

// 检查频率。真正决定"要不要发"的是 IDLE_MS / COOLDOWN_MS，
// 这里只决定"多久看一眼"——过粗会让主动消息迟迟不响应。
const TICK_MS = 3 * 60_000
/**
 * 静默多久算"他终于闲下来了"。
 * 基础 1 小时，加最多 1.5 小时抖动——固定间隔会让主动消息像闹钟，
 * 抖动让每条都像"刚好想起来"。
 * 抖动以「上次入站时间」为种子，同一个静默期内阈值不变，
 * 否则每 3 分钟一次 tick 会算出不同阈值，行为变得不可预测。
 */
const IDLE_BASE_MS = 60 * 60_000
const IDLE_JITTER_MS = 90 * 60_000

function idleThresholdMs(seedMs: number): number {
  const noise = Math.abs(Math.sin(seedMs / 60_000))
  return IDLE_BASE_MS + Math.round(noise * IDLE_JITTER_MS)
}
const COOLDOWN_MS = 3 * 60 * 60_000

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false

export type QqProactiveHost = {
  client: OneBotClient
  dataRoot: string
  selfId: string
}

function parseMs(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 收到入站消息时打点（bridge 调用），用于「双方都闲着」判断 */
export function recordQqInboundActivity(dataRoot: string, atMs = Date.now()): void {
  kvSet(dataRoot, NS, KEY_INBOUND, String(atMs))
}

export function ensureQqActivityBaseline(dataRoot: string, atMs = Date.now()): void {
  if (parseMs(kvGet(dataRoot, NS, KEY_INBOUND)) == null) {
    recordQqInboundActivity(dataRoot, atMs)
  }
}

function isAwake(now: Date): boolean {
  const h = now.getHours()
  return h >= 8 && h < 22
}

type GateResult =
  | { ok: true; peerId: string }
  | { ok: false; reason: string; quietMin?: number; needMin?: number }

export function evaluateQqProactiveGate(args: {
  dataRoot: string
  enabled: boolean
  connected: boolean
  now?: Date
}): GateResult {
  const now = args.now ?? new Date()
  if (!args.enabled) return { ok: false, reason: 'disabled' }
  if (!args.connected) return { ok: false, reason: 'not_connected' }
  if (!isAwake(now)) return { ok: false, reason: 'sleep_hours' }

  const nowMs = now.getTime()
  const inbound = parseMs(kvGet(args.dataRoot, NS, KEY_INBOUND))
  // inbound 为 null 表示"从来没记录过入站时间"（kv 写入失败或首次运行）。
  // 原逻辑把它当"刚活跃"直接拒绝，等于主动消息永久失效——
  // 现在改为：没有记录时不拦，只靠下面的 cooldown 兜住频率。
  if (inbound != null) {
    const quietFor = nowMs - inbound
    const threshold = idleThresholdMs(inbound)
    if (quietFor < threshold) {
      return { ok: false, reason: `active_recently`, quietMin: Math.round(quietFor / 60000), needMin: Math.round(threshold / 60000) }
    }
  }
  const sent = parseMs(kvGet(args.dataRoot, NS, KEY_SENT))
  if (sent != null && nowMs - sent < COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' }
  }

  const owner = getChannelOwner('qq')
  const all = listQqPeers(args.dataRoot, 8)
  const peer = (owner ? all.find((p) => p.peerId === owner) : all[0]) ?? all[0]
  if (!peer?.peerId) return { ok: false, reason: 'no_peer' }
  return { ok: true, peerId: peer.peerId }
}

/** 同一拒绝原因只记一次，避免每 5 分钟刷屏 */
const suppressed = new Set<string>()

async function tick(host: () => QqProactiveHost | null): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const settings = loadSettings()
    if (settings.qqChannelEnabled === false) return
    const live = host()
    if (!live) return

    const gate = evaluateQqProactiveGate({
      dataRoot: live.dataRoot,
      enabled: settings.qqProactiveEnabled === true,
      connected: live.client.isConnected()
    })
    if (!gate.ok) {
      // 闸门每种拒绝原因都要可见，否则"她为什么从不主动找我"永远查不出来
      // 按「原因 + 需要静默多少分钟」去重：阈值变了要重新记一条，
      // 否则永远只看到第一次的旧数值，无法判断现在离触发还差多久。
      const gateKey = `${gate.reason}:${gate.needMin ?? ''}`
      if (!suppressed.has(gateKey)) {
        suppressed.add(gateKey)
        log.info('qq proactive gated', {
          reason: gate.reason,
          quietMin: gate.quietMin,
          needMin: gate.needMin
        })
      }
      return
    }
    suppressed.clear()

    // 主动消息也写进三端统一会话：她在 QQ 先开口，桌面上同样能看到这一句
    const sessionId = resolveConversationSessionId(settings.activeSessionId)
    const composed = await composeCompanionProactiveMessage({
      dataRoot: live.dataRoot,
      settings,
      sessionId
    })
    if (!composed?.raw.trim()) {
      log.info('qq proactive compose empty', { sessionId, peerId: gate.peerId })
      return
    }
    log.info('qq proactive compose ok', { sessionId, kind: composed.kind })

    const state = loadState(live.dataRoot, sessionId)
    const hints = {
      presetId: settings.personalityPresetId,
      aro: state?.emotion.aro ?? 0,
      aff: state?.emotion.aff ?? 0,
      intensity: 0
    }

    let bubbles: QqBubble[] = planWeixinDelivery({
      rawAssistant: composed.raw,
      presetId: hints.presetId,
      userText: '',
      emotion: { aro: hints.aro, aff: hints.aff, intensity: hints.intensity }
    })
    if (bubbles.length === 0) {
      bubbles = [{ kind: 'text', body: formatBubbleForWeixin(composed.raw), delayBeforeMs: 0 }]
    }

    await sendQqOutboundSequence({
      client: live.client,
      target: { kind: 'private', userId: gate.peerId },
      bubbles,
      voice: { dataRoot: live.dataRoot }
    })

    // 记进统一历史（只记文字气泡，表情包没有可读内容）
    try {
      const visibleText = bubbles
        .filter((b) => b.kind === 'text')
        .map((b) => String(b.body))
        .join(' ')
        .replace(/\[SPLIT\]/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (visibleText) {
        const { appended } = await appendConversationAssistant({
          dataRoot: live.dataRoot,
          sessionId,
          channel: 'qq',
          peerId: gate.peerId,
          content: visibleText
        })
        if (appended.length > 0) {
          broadcastToRenderers('chat:history-appended', {
            sessionId,
            channel: 'qq',
            rows: appended
          })
        }
      }
    } catch (e) {
      log.warn('qq proactive history persist failed', { error: String(e) })
    }

    kvSet(live.dataRoot, NS, KEY_SENT, String(Date.now()))
    if (state) {
      state.counters.totalTurns = (state.counters?.totalTurns ?? 0) + 1
      saveState(live.dataRoot, state, sessionId)
    }
    log.info('qq proactive sent', {
      peerId: gate.peerId.slice(0, 12),
      kind: composed.kind,
      bubbles: bubbles.length
    })
  } catch (e) {
    log.warn('qq proactive tick failed', e)
  } finally {
    ticking = false
  }
}

export function startQqProactiveScheduler(host: () => QqProactiveHost | null): void {
  stopQqProactiveScheduler()
  const live = host()
  if (live) ensureQqActivityBaseline(live.dataRoot)
  timer = setInterval(() => {
    void tick(host)
  }, TICK_MS)
  timer.unref?.()
  log.info('qq proactive scheduler started')
}

export function stopQqProactiveScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
