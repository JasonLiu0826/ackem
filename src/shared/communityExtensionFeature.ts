/**
 * community/ 鎵╁睍甯傚満绠＄嚎鎬诲紑鍏炽€?
 * false = 涓嶆壂鎻忋€佷笉瀹夎銆佷笉鍔犺浇 community/ 绛惧悕鍖咃紱璐＄尞鑰呰 PR 鍒?Ackem/ 瀹樻柟鐩綍銆?
 * 鍗忚涓庡疄鐜颁繚鐣欏湪 ecosystem/ 渚涙棩鍚庡紑鏀俱€?
 */
export const COMMUNITY_EXTENSIONS_OPEN = false

/** 鍗曟祴鍙复鏃惰鐩栵紙鐢熶骇璺緞鍕跨敤锛?*/
let openOverride: boolean | null = null

export function setCommunityExtensionsOpenForTests(value: boolean | null): void {
  openOverride = value
}

export function isCommunityExtensionsOpen(): boolean {
  if (openOverride !== null) return openOverride
  return COMMUNITY_EXTENSIONS_OPEN
}

export const COMMUNITY_EXTENSIONS_CLOSED_ZH =
  '绀惧尯鎵╁睍甯傚満鏆傛湭寮€鏀俱€傝鍦ㄦ湰鍦扮敤 OpenForU锛坲/锛夎瘯楠岋紝婊℃剰鍚庡悜 Ackem 浠撳簱 PR 鍚堝苟涓?Ackem/ 瀹樻柟鎵╁睍銆?

export const COMMUNITY_EXTENSIONS_CLOSED_EN =
  'Community extension marketplace is not open yet. Prototype locally with OpenForU (u/), then open a PR to ship as Ackem/ built-ins.'
