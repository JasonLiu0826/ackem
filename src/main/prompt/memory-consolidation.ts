// [prompt/memory-consolidation] 鈥?鏁村悎鍙嶆€?prompt锛坴1.0 璁捐鏂囨。锛?
// 杩佺Щ鑷?memory/consolidator.ts

import { CONSOLIDATION_MAX_INSIGHTS } from '../engine/AckemParams'
import { getLocale } from '../i18n'
import { CONSOLIDATION_SYS_EN, buildConsolidationUserMsgEn } from './prompt-i18n'

export const CONSOLIDATION_TEMPERATURE = 0.3

export const CONSOLIDATION_SYS_ZH = `浣犲瑙嗕竴缁勫叧浜庣敤鎴风殑杩戞湡璁板繂浜嬪疄锛屽悎鎴愰珮灞傛礊瀵熷拰浜嬪疄闂村叧鑱斻€?

鈹€鈹€ 杈撳叆闄愬埗 鈹€鈹€
- 鍙鐞嗘渶杩?50 鏉′簨瀹烇紙鎴?weight鈮? 鐨勪簨瀹炲墠 100 鏉★級
- 杈撳叆浜嬪疄鎸夋椂闂村€掑簭鎺掑垪锛屾瘡鏉″甫搴忓彿

鈹€鈹€ 娲炲療瑙勫垯 鈹€鈹€
- 浠庡鏉′簨瀹炰腑瀵绘壘妯″紡锛堝弽澶嶅嚭鐜扮殑涓婚銆佷环鍊艰銆佹€ф牸鐗硅川銆佽涓烘ā寮忥級
- 涓嶈鎬荤粨鍗曟潯浜嬪疄鈥斺€旀壘鍑鸿法浜嬪疄鐨勪笂灞傛礊瀵?
- 娲炲療蹇呴』鏄?鐢ㄦ埛鏈洿鎺ヨ浣嗗彲浠ヤ粠澶氭潯浜嬪疄鎺ㄦ柇鐨?
- 姣忔潯娲炲療鐢ㄤ竴鍙ョ畝娲佺殑璇濋檲杩?
- 娲炲療 subcategory 鍙兘浠庝互涓嬮€夋嫨锛歏ALUES_BELIEFS, SELF_PERCEPTION, LIFESTYLE, MOOD, TASTES, GOALS, VULNERABILITIES, OUR_BOND

鈹€鈹€ 鍏宠仈瑙勫垯 鈹€鈹€
- 鍒ゆ柇浜嬪疄涔嬮棿鐨勫叧鑱斿叧绯?
- 鍏宠仈绫诲瀷锛歵emporal(鏃堕棿鏈夊叧), entity(鍚屼竴瀹炰綋), event_chain(鍥犳灉鍓嶅悗), emotion_peak(鎯呯华鐩镐技), self_reference(鑷垜璁ょ煡), thematic(鍚屼竴涓婚)
- 寮哄害鐢ㄥ畾鎬х瓑绾э細strong(0.8) / medium(0.5) / weak(0.2)
- 浣跨敤杈撳叆浜嬪疄鐨勫簭鍙峰紩鐢?

鈹€鈹€ 杈撳嚭 鈹€鈹€
{"insights":[{"subcategory":"...","subject":"鏍囩","summary":"娲炲療","triggers":["鍏抽敭璇?]}],
 "associations":[{"fact_a_idx":0,"fact_b_idx":2,"type":"thematic","strength":"medium"}]}

鑻ユ壘涓嶅埌鏈夋剰涔夌殑妯″紡锛岃繑鍥?{"insights":[],"associations":[]}`

export function getConsolidationSystem(): string {
  return getLocale() === 'en' ? CONSOLIDATION_SYS_EN : CONSOLIDATION_SYS_ZH
}

export function buildConsolidationUserMsg(factLines: string[], count: number): string {
  if (getLocale() === 'en') return buildConsolidationUserMsgEn(factLines, count)
  return `杩戞湡浜嬪疄锛堝叡${count}鏉★級锛歕n${factLines.join('\n')}`
}
