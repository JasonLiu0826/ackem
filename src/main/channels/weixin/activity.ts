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

export function recordDesktopAckemActivity(dataRoot: string, atMs = Date.now()): void {
  kvSet(dataRoot, NS, KEY_DESKTOP, String(atMs))
}

export function recordWeixinAckemActivity(dataRoot: string, atMs = Date.now()): void {
  kvSet(dataRoot, NS, KEY_WEIXIN, String(atMs))
}

export function getLastDesktopAckemActivityMs(dataRoot: string): number | null {
  return parseMs(kvGet(dataRoot, NS, KEY_DESKTOP))
}

export function getLastWeixinAckemActivityMs(dataRoot: string): number | null {
  return parseMs(kvGet(dataRoot, NS, KEY_WEIXIN))
}

export function getLastProactiveSentMs(dataRoot: string): number | null {
  return parseMs(kvGet(dataRoot, NS, KEY_PROACTIVE_SENT))
}

export function recordProactiveSent(dataRoot: string, atMs = Date.now()): void {
  kvSet(dataRoot, NS, KEY_PROACTIVE_SENT, String(atMs))
}

/** 棣栨鍚姩鏃跺啓鍏ャ€屽綋鍓嶃€嶏紝閬垮厤鍒氳繛涓婂氨涓诲姩鍙?*/
export function ensureActivityBaselines(dataRoot: string, atMs = Date.now()): void {
  if (getLastDesktopAckemActivityMs(dataRoot) == null) {
    recordDesktopAckemActivity(dataRoot, atMs)
  }
  if (getLastWeixinAckemActivityMs(dataRoot) == null) {
    recordWeixinAckemActivity(dataRoot, atMs)
  }
}
