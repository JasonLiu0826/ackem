import { loadSettings } from '../../settings'
import { loadWeixinAccount, loadContextToken, listWeixinPeers } from './store'
import { planWeixinDelivery } from './deliveryPlanner'
import { sendWeixinOutboundSequence } from './outboundSequence'
import { resolveDataRoot } from '../../paths'
import { createLogger } from '../../logger'

const log = createLogger('weixin-mirror')
const outboundTurnIds = new Set<string>()

export function markWeixinOutbound(turnId: string): void {
  outboundTurnIds.add(turnId)
  if (outboundTurnIds.size > 500) {
    const first = outboundTurnIds.values().next().value
    if (first) outboundTurnIds.delete(first)
  }
}

export function wasWeixinOutbound(turnId: string): boolean {
  return outboundTurnIds.has(turnId)
}

/** 桌面 Ackem 回复镜像到微信（通道在线时） */
export async function mirrorAssistantToWeixin(args: {
  dataRoot: string
  text: string
  turnId: string
  presetId?: string
}): Promise<void> {
  const settings = loadSettings()
  if (!settings.weixinChannelEnabled) return
  if (settings.weixinMirrorEnabled === false) return
  if (!args.text.trim()) return
  if (wasWeixinOutbound(args.turnId)) return

  const account = loadWeixinAccount(args.dataRoot)
  if (!account?.token) return

  const peers = listWeixinPeers(args.dataRoot, 1)
  const peer = peers[0]
  if (!peer) return

  try {
    const bubbles = planWeixinDelivery({
      rawAssistant: args.text,
      presetId: args.presetId ?? settings.personalityPresetId,
      userText: '',
      emotion: { aro: 0, aff: 0 },
      rng: () => 0.35,
    })
    if (bubbles.length === 0) return

    const contextToken = loadContextToken(args.dataRoot, peer.peerId) ?? undefined
    await sendWeixinOutboundSequence({
      account,
      peerId: peer.peerId,
      contextToken,
      bubbles,
      dataRoot: args.dataRoot,
    })
    markWeixinOutbound(args.turnId)
    log.info('mirrored assistant to weixin', { turnId: args.turnId, peerId: peer.peerId })
  } catch (e) {
    log.warn('mirror to weixin failed', e)
  }
}

/** 主动问候同源文案镜像微信 */
export async function mirrorProactiveToWeixin(args: {
  dataRoot: string
  text: string
  proactiveId: string
  presetId?: string
}): Promise<void> {
  await mirrorAssistantToWeixin({
    dataRoot: args.dataRoot,
    text: args.text,
    turnId: `proactive:${args.proactiveId}`,
    presetId: args.presetId,
  })
}
