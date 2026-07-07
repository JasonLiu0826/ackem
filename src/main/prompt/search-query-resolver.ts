// [prompt/search-query-resolver] 鈥?鏌ヨ瑙ｆ瀽 prompt锛坴1.1 璁捐鏂囨。锛?
// 杩佺Щ鑷?knowledge-presentation/presentation/searchQueryResolver.ts

import { getLocale } from '../i18n'
import { SEARCH_RESOLVE_SYSTEM_EN, buildSearchResolveUserMsgEn } from './prompt-i18n'

export const SEARCH_RESOLVE_TEMPERATURE = 0.15

export const SEARCH_RESOLVE_SYSTEM_ZH = `浣犳槸鎼滅储鎰忓浘瑙ｆ瀽鍣ㄣ€傛牴鎹敤鎴峰師璇濆拰鍊欓€夋悳绱㈣瘝锛屽垽鏂敤鎴风湡姝ｆ兂鏌ヤ粈涔堬紝骞惰緭鍑洪€傚悎浜ょ粰閫氱敤缃戦〉鎼滅储寮曟搸鐨勬煡璇覆銆?

鈹€鈹€ 瑙勫垯 鈹€鈹€
路 娑堥櫎姝т箟锛堝悓涓€璇嶅彲鑳芥寚涓嶅悓浜嬬墿鏃讹紝鏌ヨ涓查』甯︿笂鐢ㄦ埛鍏冲績鐨勯鍩?瀹炰綋/鐗堟湰绛夐檺瀹氾級
路 淇鍙ｈ娈嬬己鍊欓€夛紙濡傘€屼竴涓媥xx銆嶏級锛屼繚鐣欒嫳鏂囦笓鍚嶃€佺増鏈彿銆佸瀷鍙?
路 涓嶈缂栭€犵敤鎴锋湭鎻愬強鐨勪富棰?
路 绂佹杈撳嚭鍗曞瓧鎴栦笉瓒?4 瀛楃殑姝т箟鏌ヨ
路 濡傛灉鐢ㄦ埛鏈€杩戝湪鑱婃煇涓瘽棰橈紝浼樺厛鍏宠仈璇ヨ瘽棰?
路 鐢ㄦ埛鐢ㄣ€屼綘銆嶆寚 Ackem 骞朵笌 Cursor/Codex 绛夊姣旀椂锛歴earch_query 搴旀煡 **Ackem 浼翠荆搴旂敤** 涓庡鏂逛骇鍝侊紝**绂佹**鎶?DeepSeek/GPT/Claude 绛夊簳灞傛ā鍨嬪悕褰撲綔 Ackem 鐨勬悳绱㈣瘝

鈹€鈹€ 杈撳嚭 鈹€鈹€
浠呰緭鍑轰竴琛?JSON锛屼笉瑕?markdown锛歿"search_query":"...","display_label":"鐭爣棰?,"intent_summary":"涓€鍙ヨ瘽鎰忓浘"}`

export const SEARCH_RESOLVE_SYSTEM = SEARCH_RESOLVE_SYSTEM_ZH

export function getSearchResolveSystem(): string {
  return getLocale() === 'en' ? SEARCH_RESOLVE_SYSTEM_EN : SEARCH_RESOLVE_SYSTEM_ZH
}

export function buildSearchResolveUserMsg(
  userMessage: string,
  candidateBlock: string,
  recentContext?: string,
): string {
  if (getLocale() === 'en') return buildSearchResolveUserMsgEn(userMessage, candidateBlock, recentContext)
  return [
    `鐢ㄦ埛鍘熻瘽锛歕n${userMessage || '锛堢┖锛?}`,
    '',
    recentContext ? `鏈€杩戝璇濅笂涓嬫枃锛堝彧渚涙秷姝э紝涓嶈缂栭€狅級锛?{recentContext}` : '',
    '',
    `鍊欓€夋悳绱㈣瘝锛歕n${candidateBlock || '锛堟棤锛岃浠呮牴鎹敤鎴峰師璇濈敓鎴愶級'}`,
  ]
    .filter(Boolean)
    .join('\n')
}
