// [channels/ownerGate] — 机主绑定
// 目的：只有主人自己的 QQ / 微信能驱动 ACKEM。
//
// 安全模型（v2.0.0 起）：
//   1. 首个私聊者不会自动成为机主，只会进入「待确认」状态（记在 settings 里）；
//   2. 必须由机主在桌面端（设置 → 移动端 → QQ / 微信）手动确认后，才授予机主权限；
//   3. 确认之前，该渠道所有入站消息一律忽略（既不进主流程，也不写入记忆）。
//
// 这样做是为了堵住「渠道已连接、机主尚未绑定」这段时间的抢绑风险：
// 陌生人先发消息也拿不到机主身份，只能排队等桌面确认。
import { loadSettings, saveSettings } from '../settings'
import { createLogger } from '../logger'

const log = createLogger('channel-owner')

export type OwnerKind = 'qq' | 'weixin'

function ownerOf(kind: OwnerKind, s: ReturnType<typeof loadSettings>): string {
  const raw = kind === 'qq' ? s.channelOwnerQqId : s.channelOwnerWeixinId
  return (raw ?? '').trim()
}

function pendingOf(kind: OwnerKind, s: ReturnType<typeof loadSettings>): string {
  const raw = kind === 'qq' ? s.channelOwnerPendingQqId : s.channelOwnerPendingWeixinId
  return (raw ?? '').trim()
}

function ownerPatch(kind: OwnerKind, owner: string, pending: string): Record<string, string> {
  return kind === 'qq'
    ? { channelOwnerQqId: owner, channelOwnerPendingQqId: pending }
    : { channelOwnerWeixinId: owner, channelOwnerPendingWeixinId: pending }
}

/** 桌面通知：有新的机主绑定候选（测试环境没有 electron 时静默跳过） */
function notifyPendingCandidate(kind: OwnerKind, peerId: string): void {
  void import('electron')
    .then(({ Notification }) => {
      if (!Notification?.isSupported?.()) return
      new Notification({
        title: 'Ackem 机主绑定请求',
        body: `${kind === 'qq' ? 'QQ' : '微信'} 用户 ${peerId} 请求绑定为机主。请到「设置 → 移动端」确认后再使用。`
      }).show()
    })
    .catch(() => {
      /* 测试 / 无 electron 环境 */
    })
}

/**
 * 入站校验：只有「已确认」的机主才放行。
 * 未绑定时记录待确认候选并返回 false —— 不会自动授予机主身份。
 */
export function isChannelOwner(kind: OwnerKind, peerId: string): boolean {
  const peer = String(peerId ?? '').trim()
  if (!peer) return false

  const settings = loadSettings()
  const bound = ownerOf(kind, settings)
  if (!bound) {
    // 还没有机主：记录候选，等桌面确认；候选变化时（例如换人发消息）更新并通知
    if (pendingOf(kind, settings) !== peer) {
      try {
        saveSettings(ownerPatch(kind, '', peer) as never)
        log.info('owner pending confirmation', { kind, peerId: peer })
        notifyPendingCandidate(kind, peer)
      } catch (e) {
        log.error('record pending owner failed', { kind, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return false
  }
  if (bound === peer) return true
  log.info('non-owner message ignored', { kind, peerId: peer })
  return false
}

/** 当前已确认的机主（未绑定返回 ''） */
export function getChannelOwner(kind: OwnerKind): string {
  return ownerOf(kind, loadSettings())
}

/** 当前待确认的机主候选（没有返回 ''） */
export function getPendingChannelOwner(kind: OwnerKind): string {
  return pendingOf(kind, loadSettings())
}

/** 桌面确认：把待确认候选提升为机主；显式传 peerId 时直接绑定该 id */
export function confirmChannelOwner(kind: OwnerKind, peerId?: string): boolean {
  const settings = loadSettings()
  const peer = String(peerId ?? pendingOf(kind, settings)).trim()
  if (!peer) {
    log.warn('confirm owner rejected: no candidate', { kind })
    return false
  }
  try {
    saveSettings(ownerPatch(kind, peer, '') as never)
    log.info('owner confirmed', { kind, peerId: peer })
    return true
  } catch (e) {
    log.error('confirm owner failed', { kind, error: e instanceof Error ? e.message : String(e) })
    return false
  }
}

/** 桌面拒绝：清空待确认候选，保持未绑定 */
export function dismissPendingChannelOwner(kind: OwnerKind): void {
  try {
    saveSettings(ownerPatch(kind, '', '') as never)
    log.info('pending owner dismissed', { kind })
  } catch (e) {
    log.error('dismiss pending owner failed', { kind, error: e instanceof Error ? e.message : String(e) })
  }
}

/** 解绑机主（同时清空候选），下次入站重新进入待确认 */
export function resetChannelOwner(kind: OwnerKind): void {
  try {
    saveSettings(ownerPatch(kind, '', '') as never)
    log.info('owner reset', { kind })
  } catch (e) {
    log.error('reset owner failed', { kind, error: e instanceof Error ? e.message : String(e) })
  }
}
