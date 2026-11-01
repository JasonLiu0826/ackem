// [channels/ownerGate] — 机主绑定
// 目的：只有主人自己的 QQ / 微信（首个私聊者，自动绑定）能驱动 ACKEM。
// 陌生人消息直接丢弃：既防隐私（机主档案/记忆不会进陌生人上下文），
// 也让"渠道远程电脑助手"只对机主生效。
import { loadSettings, saveSettings } from '../settings'
import { createLogger } from '../logger'

const log = createLogger('channel-owner')

export type OwnerKind = 'qq' | 'weixin'

function readOwner(kind: OwnerKind): string {
  const s = loadSettings()
  const raw = kind === 'qq' ? s.channelOwnerQqId : s.channelOwnerWeixinId
  return (raw ?? '').trim()
}

function writeOwner(kind: OwnerKind, peerId: string): void {
  saveSettings(kind === 'qq' ? { channelOwnerQqId: peerId } : { channelOwnerWeixinId: peerId })
}

/** 返回 true 表示允许继续处理；首个私聊者自动成为机主 */
export function isChannelOwner(kind: OwnerKind, peerId: string): boolean {
  const peer = String(peerId ?? '').trim()
  if (!peer) return false

  const bound = readOwner(kind)
  if (!bound) {
    try {
      writeOwner(kind, peer)
      log.info('owner bound', { kind, peerId: peer })
      return true
    } catch (e) {
      log.error('bind owner failed', { kind, error: e instanceof Error ? e.message : String(e) })
      return false
    }
  }
  if (bound === peer) return true
  log.info('non-owner message ignored', { kind, peerId: peer })
  return false
}

export function getChannelOwner(kind: OwnerKind): string {
  return readOwner(kind)
}

export function resetChannelOwner(kind: OwnerKind): void {
  writeOwner(kind, '')
  log.info('owner reset', { kind })
}
