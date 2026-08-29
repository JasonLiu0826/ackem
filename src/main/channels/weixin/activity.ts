import { kvGet, kvSet } from '../../db/repos/kv'

const NS = 'weixin_proactive'

const KEY_DESKTOP = 'last_desktop_ms'
const KEY_WEIXIN = 'last_weixin_ms'
const KEY_PROACTIVE_SENT = 'last_proactive_sent_ms'

function parseMs(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function recordDesktopBritneyActivity(dataRoot: string, atMs = Date.now()): void {
  kvSet(dataRoot, NS, KEY_DESKTOP, String(atMs))
}

export function recordWeixinBritneyActivity(dataRoot: string, atMs = Date.now()): void {
  kvSet(dataRoot, NS, KEY_WEIXIN, String(atMs))
}

export function getLastDesktopBritneyActivityMs(dataRoot: string): number | null {
  return parseMs(kvGet(dataRoot, NS, KEY_DESKTOP))
}

export function getLastWeixinBritneyActivityMs(dataRoot: string): number | null {
  return parseMs(kvGet(dataRoot, NS, KEY_WEIXIN))
}

export function getLastProactiveSentMs(dataRoot: string): number | null {
  return parseMs(kvGet(dataRoot, NS, KEY_PROACTIVE_SENT))
}

export function recordProactiveSent(dataRoot: string, atMs = Date.now()): void {
  kvSet(dataRoot, NS, KEY_PROACTIVE_SENT, String(atMs))
}

/** 首次启动时写入「当前」，避免刚连上就主动发 */
export function ensureActivityBaselines(dataRoot: string, atMs = Date.now()): void {
  if (getLastDesktopBritneyActivityMs(dataRoot) == null) {
    recordDesktopBritneyActivity(dataRoot, atMs)
  }
  if (getLastWeixinBritneyActivityMs(dataRoot) == null) {
    recordWeixinBritneyActivity(dataRoot, atMs)
  }
}
