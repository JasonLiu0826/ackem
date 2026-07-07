/**
 * [embedding/routeTable] 鈥?Embedding 璺敱琛?
 *
 * 鑱岃矗锛?
 *   1. 瀹氫箟瀹樻柟鎵╁睍鐨?exampleQueries
 *   2. 鏋勫缓 Embedding 璺敱绱㈠紩锛堝惎鍔ㄦ椂鎵归噺璁＄畻锛?
 *   3. 鏌ヨ鍖归厤锛堢敤鎴锋秷鎭?vs 璺敱琛級
 *
 * 璁捐鏂囨。锛歞ocs/system/Embedding鎰忓浘璺敱璁捐_6_8_宸插疄鐜?md
 */

import type { EmbeddingProvider } from '../memory/embedding'
import { cosineSimilarity } from '../memory/factEmbeddingCache'
import {
  HIGH_CONFIDENCE_THRESHOLD,
  MID_CONFIDENCE_THRESHOLD,
  type RouteIndex,
  type RouteIndexEntry,
  type RouteMatchResult,
} from './types'

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 瀹樻柟鎵╁睍璺敱琛紙纭紪鐮侊級
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

/**
 * 瀹樻柟鎵╁睍鐨?exampleQueries銆?
 * 姣忎釜鎵╁睍 5-10 鏉＄敤鎴峰疄闄呬細璇寸殑璇濄€?
 * 鍚姩鏃惰嚜鍔ㄨ绠?Embedding 骞跺姞鍏ヨ矾鐢辩储寮曘€?
 */
export const BUILTIN_ROUTE_TABLE: Record<string, string[]> = {
  // 澶╂皵
  'Ackem/weather-sense@0.0.1': [
    '甯垜鏌ュぉ姘?, '鏄庡ぉ浼氫笅闆ㄥ悧', '闇€瑕佸甫浼炲悧',
    '鏉窞澶╂皵鎬庝箞鏍?, '浠婂ぉ鍐蜂笉鍐?, '姘旀俯澶氬皯搴?,
    '浠婂ぉ浼氫笉浼氫笅闆?, '鍑洪棬闇€瑕佸甫浼炲悧',
  ],

  // 鎼滅储
  'Ackem/web-search@1.0.0': [
    '甯垜鎼滀竴涓嬪ぉ姘?, '鏌ヤ竴涓嬫槑澶╁ぉ姘?,
    '甯垜鏌ヤ竴涓嬭繖涓粈涔堟剰鎬?, '鎼滅储涓€涓嬭繖涓瘝',
    '甯垜鎵炬壘鐩稿叧璧勬枡', '杩欎釜涓滆タ鏄粈涔?,
    '甯垜涓婄綉鏌ユ煡', '鎼滀竴涓嬫渶杩戞湁浠€涔堟柊闂?,
  ],

  // 鎻愰啋
  'Ackem/sedentary-reminder@0.0.1': [
    '鍧愬緱鑵扮柤', '鍧愬お涔呬簡', '璇ョ珯璧锋潵浜嗗惂',
    '璧锋潵娲诲姩涓€涓?, '鑴栧瓙濂介吀', '鑵颁笉鑸掓湇',
    '鍧愪箙浜嗕笉鑸掓湇', '璇ユ椿鍔ㄦ椿鍔ㄤ簡',
  ],
  'Ackem/drink-water-reminder@0.0.1': [
    '鎴戞兂鍠濇按', '璇ュ枬姘翠簡', '濂芥复',
    '琛ュ厖姘村垎', '鍊掓澂姘?, '鎻愰啋鎴戝枬姘?,
    '鍙ｆ复浜?,
  ],
  'Ackem/late-night-reminder@0.0.1': [
    '鐔濂戒激韬?, '璇ョ潯瑙変簡', '鎬庝箞杩欎箞鏅氫簡',
    '宸茬粡鏄噷鏅ㄤ簡', '璇ヤ紤鎭簡',
  ],

  // 闄即
  'Ackem/emergency-companion@1.0.0': [
    '鎴戝績鎯呬笉濂?, '濂介毦鍙?, '鎯冲摥',
    '鎴戝ソ闅捐繃', '蹇冮噷涓嶈垝鏈?, '鎰熻鎾戜笉涓嬪幓浜?,
    '鎯虫壘浜鸿璇磋瘽', '浠婂ぉ鐗瑰埆闅捐繃',
  ],

  // 琛ㄦ牸
  'Ackem/markdown-table@1.0.0': [
    '甯垜鍋氫釜琛ㄦ牸', '鏁寸悊鎴愯〃鏍煎舰寮?, '鍋氫釜瀵规瘮琛?,
    '甯垜鍒椾釜娓呭崟', '鍋氫釜瀵规瘮', '鍒椾釜琛?,
  ],

  // 鏃ョ▼鎻愰啋
  'Ackem/light-schedule@0.0.1': [
    '鎻愰啋鎴戜笅鍗?鐐瑰紑浼?, '鏄庡ぉ9鐐瑰彨鎴?, '璁句釜闂归挓',
    '甯垜璁颁竴涓嬫棩绋?, '涓嬪崍鏈変釜浼氬埆璁╂垜蹇樹簡',
    '甯垜璁剧疆鎻愰啋', '璁颁竴涓嬭繖涓椂闂?,
  ],

  // 鏃ヨ
  'Ackem/diary-auto@0.1.0': [
    '鍐欐棩璁?, '浠婂ぉ鍙戠敓浜嗕粈涔?, '甯垜璁板綍浠婂ぉ',
    '浠婂ぉ鐨勬棩璁?, '甯垜鍐欐棩璁?,
  ],

  // 璁″垝涔?
  'Ackem/plan-document@1.0.0': [
    '鍋氫釜璁″垝', '甯垜瑙勫垝涓€涓?, '鎺掍釜鏃ョ▼',
    '甯垜瀹夋帓涓€涓嬭绋?, '鍋氫竴浠借鍒掍功',
    '甯垜瑙勫垝鏃呰', '鎺ヤ笅鏉ヨ鍋氫粈涔?,
  ],

  // 鐭ヨ瘑鍛堢幇
  'Ackem/knowledge-presentation@1.0.0': [
    '杩欐槸浠€涔?, '瑙ｉ噴涓€涓?, '甯垜绉戞櫘涓€涓?,
    '浠嬬粛涓€涓?, '鎴戞兂浜嗚В', '閲忓瓙璁＄畻鏄粈涔?,
  ],

  // 瓒ｅ懗妗ｆ
  'Ackem/fun-profile@0.0.1': [
    '鎴戜粖澶╂槸浠€涔堢姸鎬?, '缁欐垜鍋氫釜鍒嗘瀽', '鎴戞渶杩戞€庝箞鏍?,
    '鐪嬬湅鎴戠殑鎯呯华', '鍒嗘瀽涓€涓嬫垜',
  ],

  // 妗岄潰闄即
  'Ackem/desktop-companion@0.0.1': [
    '鎵撳紑妗岄潰闄即', '鏄剧ず妗岄潰', '闅愯棌闄即',
    '寮€鍚闈㈡ā寮?,
  ],
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 璺敱琛ㄦ瀯寤?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

/**
 * 鍚姩鏃惰皟鐢細鏋勫缓 Embedding 璺敱绱㈠紩銆?
 *
 * @param provider EmbeddingProvider 瀹炰緥
 * @param extraEntries 棰濆鐨勮矾鐢辨潯鐩紙uplugin/uskills/鑷姩瀛︿範锛?
 * @returns 璺敱绱㈠紩
 */
export async function buildRouteIndex(
  provider: EmbeddingProvider,
  extraEntries: Array<{ extensionId: string; query: string }> = []
): Promise<RouteIndex> {
  // 鏀堕泦鎵€鏈夎矾鐢辨潯鐩?
  const allQueries: Array<{ extId: string; query: string }> = []

  for (const [extId, queries] of Object.entries(BUILTIN_ROUTE_TABLE)) {
    for (const q of queries) {
      allQueries.push({ extId, query: q })
    }
  }
  for (const e of extraEntries) {
    allQueries.push({ extId: e.extensionId, query: e.query })
  }

  // 鍘婚噸锛堝悓涓€ query 鍙兘瀵瑰簲澶氫釜鎵╁睍锛?
  const seen = new Set<string>()
  const unique = allQueries.filter((q) => {
    const key = `${q.extId}||${q.query}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 鎵归噺璁＄畻 Embedding
  const embeddings = await provider.embedBatch(unique.map((q) => q.query))

  // 缁勮绱㈠紩
  const entries: RouteIndexEntry[] = unique.map((q, i) => ({
    extensionId: q.extId,
    query: q.query,
    embedding: embeddings[i] ?? [],
  }))

  return { entries }
}

/**
 * 鏂版墿灞曟敞鍐屾椂锛氬閲忔洿鏂拌矾鐢辩储寮曪紙鍙畻鏂?queries 鐨?Embedding锛夈€?
 */
export async function addToRouteIndex(
  index: RouteIndex,
  extensionId: string,
  newQueries: string[],
  provider: EmbeddingProvider
): Promise<void> {
  const embeddings = await provider.embedBatch(newQueries)
  for (let i = 0; i < newQueries.length; i++) {
    if (embeddings[i]?.length > 0) {
      index.entries.push({
        extensionId,
        query: newQueries[i],
        embedding: embeddings[i],
      })
    }
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 璺敱鍖归厤
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

/**
 * 姣忔潯娑堟伅璋冪敤锛欵mbedding 鍖归厤璺敱琛ㄣ€?
 *
 * @param queryEmbed 鐢ㄦ埛娑堟伅鐨?Embedding 鍚戦噺
 * @param index 璺敱绱㈠紩
 * @param topK 杩斿洖 top-K 鍖归厤缁撴灉
 * @returns 鎺掑簭鍚庣殑鍖归厤缁撴灉鍒楄〃
 */
export function matchAgainstRouteTable(
  queryEmbed: number[],
  index: RouteIndex,
  topK: number = 5
): RouteMatchResult[] {
  return index.entries
    .map((entry) => ({
      extensionId: entry.extensionId,
      query: entry.query,
      score: cosineSimilarity(queryEmbed, entry.embedding),
    }))
    .filter((r) => r.score >= MID_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 瑙勫垯妫€鏌ワ紙绗簩灞傦級
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export type RuleResult = {
  action: 'allow' | 'block' | 'uncertain'
  reason: string
}

/**
 * 绗簩灞傦細涓疆淇℃椂鐨勮鍒欐鏌ャ€?
 *
 * @param message 鐢ㄦ埛娑堟伅
 * @returns 瑙勫垯鍒ゆ柇缁撴灉
 */
export function applyQuickRules(message: string): RuleResult {
  // 瑙勫垯 1锛氬惁瀹氳瘝 鈫?涓嶈Е鍙?
  if (/涓嶈|鍒珅涓嶆兂|鍋滄|鍙栨秷|鍏抽棴|绠椾簡/.test(message)) {
    return { action: 'block', reason: 'negation_detected' }
  }

  // 瑙勫垯 2锛氱枒闂彞锛堜笉鏄姹傦級鈫?涓嶈Е鍙?
  if (/濂戒笉濂絴鏄粈涔坾鎬庝箞鏍穦鍙互鍚?.test(message)
      && !/鎵撳紑|鍚姩|甯垜|鎴戣|璇?.test(message)) {
    return { action: 'block', reason: 'question_not_request' }
  }

  // 瑙勫垯 3锛氭椂闂寸浉鍏?+ 闈?dispatched 鎵╁睍 鈫?涓嶈Е鍙?
  if (/鎻愰啋鎴憒鍑犵偣|鍒版椂鍊?.test(message)) {
    return { action: 'block', reason: 'schedule_no_dispatched' }
  }

  return { action: 'uncertain', reason: 'rule_uncertain' }
}
