// [prompt/memory-fact-extract] 鈥?浜嬪疄鎶藉彇 prompt锛坴1.0 璁捐鏂囨。锛?
// 杩佺Щ鑷?memory/factExtractor.ts锛屾寜璁捐鍗囩骇

import { FACT_EXTRACTION_MAX_PER_TURN } from '../engine/AckemParams'
import { DOMAINS, SUBCATEGORIES } from '../memory/taxonomy'
import { getLocale } from '../i18n'
import { FACT_EXTRACT_SYS_EN } from './prompt-i18n'

export const FACT_EXTRACT_TEMPERATURE = 0.2

const DOMAIN_LIST = DOMAINS.join(', ')
const SUBCAT_LINES = Object.entries(SUBCATEGORIES)
  .map(([d, arr]) => `${d}: ${(arr as readonly string[]).join(', ')}`)
  .join('\n')

/** 鏃х増 prompt锛堜繚鎸佸吋瀹癸級 */
export function buildFactExtractSysOld(locale: string): string {
  if (locale.startsWith('en')) {
    return `You extract at most ${FACT_EXTRACTION_MAX_PER_TURN} memory facts as JSON. Domains: ${DOMAIN_LIST}. Subcategories per domain:\n${SUBCAT_LINES}\nweight: 0-3. confidence: 0.0-1.0. Return ONLY JSON: {"facts":[{"domain","subcategory","subject","summary","weight","confidence","selfRelevance","triggers"}]}`
  }
  if (locale.startsWith('ja')) {
    return `浼氳┍銇嬨倝鏈€澶?{FACT_EXTRACTION_MAX_PER_TURN}浠躲伄浜嬪疅銈扟SON銇ф娊鍑恒€傘儔銉°偆銉? ${DOMAIN_LIST}銆傘偟銉栥偒銉嗐偞銉?\n${SUBCAT_LINES}\nweight: 0-3銆俢onfidence: 0.0-1.0銆侸SON銇伩: {"facts":[{"domain","subcategory","subject","summary","weight","confidence","selfRelevance","triggers"}]}`
  }
  return `浠庡璇濅腑鎶藉彇鏈€澶?${FACT_EXTRACTION_MAX_PER_TURN} 鏉″彲璁板繂浜嬪疄锛岃緭鍑?JSON銆傞鍩燂細${DOMAIN_LIST}銆傚瓙绫伙細\n${SUBCAT_LINES}\nweight: 0-3銆俢onfidence: 0.0-1.0锛堝皬鏁帮紝闈炵櫨鍒嗗埗锛夈€備粎杈撳嚭 JSON锛歿"facts":[{"domain","subcategory","subject","summary","weight","confidence","selfRelevance","triggers"}]}`
}

/** v1.1 鍗囩骇鐗?prompt锛堝惈 25 瀛愮被瀹氫箟 + weight/confidence 瑙勫垯 + 鎷掔粷娓呭崟锛?*/
export const FACT_EXTRACT_SYS_ZH = `浣犳槸 Ackem 鐨勮蹇嗘娊鍙栧櫒銆備粠銆愭湰杞璇濄€戜腑鎶藉彇鍏充簬鐢ㄦ埛鐨勭粨鏋勫寲浜嬪疄銆?

鈹€鈹€ 鏍稿績鍘熷垯 鈹€鈹€
鍙粠銆愮敤鎴枫€戝彂瑷€鎶藉彇鍏充簬鐢ㄦ埛鐨勪簨瀹烇紱绂佹浠庛€愪即渚ｃ€戝彂瑷€鍐欏叆鐢ㄦ埛妗ｆ锛堜即渚ｇ殑鐢熸棩/鍚嶅瓧/璁惧畾涓嶅緱璁颁负鐢ㄦ埛淇℃伅锛夈€?
鍙娊鍙?濡傛灉鐢ㄦ埛鏄庡ぉ鎹竴涓?AI 浼翠荆锛岃繖鏉′俊鎭槸鍚︽湁鍔╀簬閭ｄ釜 AI 鏇村ソ鍦颁簡瑙ｇ敤鎴?鐨勪簨瀹炪€?
绛旀鏄惁灏辫烦杩囥€傚畞缂烘瘚婊ャ€?

鈹€鈹€ 25 瀛愮被瀹氫箟 鈹€鈹€
IDENTITY锛堣嚜鎴戣韩浠斤級
路 BASIC_PROFILE锛氫汉鍙ｅ纭瀹氾紙骞撮緞/鑱屼笟/鍩庡競锛夈€傗湏"28宀佺▼搴忓憳浣忓寳浜? 鉁?鍠滄缂栫▼"锛堝綊TASTES锛?
路 LIFE_STORY锛氫汉鐢熼噸澶х粡鍘嗭紙姣曚笟/鎼/閲嶅ぇ浜嬩欢锛夈€傗湏"2023骞翠粠鍖椾含鎼埌涓婃捣"
路 VALUES_BELIEFS锛氫笁瑙?淇′话/鍘熷垯銆傗湏"璁や负瀹跺涵浼樺厛浜庝簨涓?
路 SELF_PERCEPTION锛氱敤鎴峰鑷繁鐨勪腑鎬ц瘎浠枫€傗湏"鎴戣寰楄嚜宸卞唴鍚?

SOCIAL锛堝叧绯荤ぞ浜わ級
路 OUR_BOND锛氫綘鍜岀敤鎴蜂箣闂寸殑浜掑姩/绾﹀畾/鍏崇郴瀹氫箟銆傗湏"鐢ㄦ埛璇村拰鎴戣亰澶╁緢鏀炬澗"
路 FAMILY锛氬搴垚鍛樹俊鎭€傗湏"鐢ㄦ埛鏈変釜濡瑰鍦ㄨ楂樹腑"
路 FRIENDS锛氭湅鍙?绀句氦鍦堛€傗湏"鐢ㄦ埛鐨勬湅鍙嬪皬鏄庝篃鍠滄鎵撶鐞?
路 PARTNER锛氭亱鐖?浼翠荆淇℃伅銆傗湏"鐢ㄦ埛鍗曡韩涓夊勾"

DAILY_LIFE锛堟棩甯哥敓娲伙級
路 ROUTINES锛氳寰嬫€т範鎯€傗湏"姣忓ぉ鍠濅袱鏉挅鍟?
路 HEALTH锛氳韩浣撶姸鍐?鐤剧梾/鍋ュ悍銆傗湏"鐢ㄦ埛鏈夊亸澶寸棝"
路 LIVING_SPACE锛氬眳浣忕幆澧?瀹犵墿銆傗湏"鍏讳簡涓€鍙尗鍙眴璞?
路 LIFESTYLE锛氱敓娲绘柟寮忓亸濂姐€傗湏"鍠滄鍛ㄦ湯鐖北"

PURSUITS锛堜簨涓氭垚闀匡級
路 CAREER锛氬伐浣?鑱屼笟/鍚屼簨銆傗湏"璁捐甯堬紝鏈€杩戝湪璧堕」鐩?
路 LEARNING锛氬涔?鎶€鑳姐€傗湏"姝ｅ湪瀛ython"
路 GOALS锛氶暱鏈熺洰鏍囥€傗湏"鎯充竴骞村唴涔版埧"
路 PROJECTS锛氬叿浣撻」鐩?浠诲姟銆傗湏"鍦ㄥ仛涓汉鍗氬"
路 PROCEDURES锛氬仛浜嬫柟娉?娴佺▼鍋忓ソ銆傗湏"涔犳儻鍏堝垪娓呭崟鍐嶅仛浜?

INNER_WORLD锛堝唴蹇冧笘鐣岋級
路 MOOD锛氬綋鍓嶇煭鏆傛儏缁€傗湏"浠婂ぉ寰堢劍铏?
路 TASTES锛氬叿浣撳枩濂?闆峰尯銆傗湏"鍠滄鐖靛＋涔?
路 VULNERABILITIES锛氳剢寮辩偣/鎭愭儳/涓嶅畨鍏ㄦ劅銆傗湏"瀹虫€曡鎷掔粷"
路 INSIDE_JOKES锛氫綘浠箣闂寸嫭鏈夌殑姊椼€傗湏"'浣犲張蹇樹簡鍠傜尗'鏄紑鐜╃瑧"

TEMPORAL锛堝綋涓嬫湭鏉ワ級
路 NOW锛氬綋鍓嶇煭鏃剁姸鎬侊紙3澶╁唴澶辨晥锛夈€傗湏"鐜板湪寰堥タ"
路 COMMITMENTS锛氭壙璇?绾﹀畾锛堜笉琛板噺锛夈€傗湏"璇村懆鏈竴璧风湅鐢靛奖"
路 PLANS锛氳繎鏈熻鍒掞紙7澶╁唴锛夈€傗湏"鎵撶畻鍛ㄤ簲鍘讳綋妫€"
路 WORLD锛氬閮ㄤ笘鐣屼俊鎭€傗湏"浠婂ぉ鏄鍗堣妭"

鈹€鈹€ weight 瑙勫垯 鈹€鈹€
3 = 鏍稿績/姘镐箙锛堟弧瓒冲叾涓€锛夛細
  路 鐢ㄦ埛鏄庣‘璇村嚭娑夊強鑷垜璁ゅ悓鏀瑰彉鐨勮瘽
  路 浜嬩欢涓嶅彲閫嗕笖褰卞搷缁堣韩
  路 鐢ㄦ埛瀵逛綘娑夊強娣卞眰渚濊禆锛?鍙湁浣犵悊瑙ｆ垜"锛?
2 = 閲嶈/闀挎湡锛氭寔缁嚑涓湀鍒板嚑骞达紙鏂板伐浣?杩囨晱/骞村害鐩爣/閲嶅鎻愬埌2+娆★級
1 = 鏅€?鐭湡锛氭棩甯稿亸濂芥垨杩戞湡鐘舵€?
0 = 涓存椂/鑳屾櫙锛氫粎褰撳墠璇鏈夌敤銆傚敖閲忎笉鎶斤紝闄ら潪 NOW 瀛愮被銆?

鈹€鈹€ confidence 瑙勫垯 鈹€鈹€
1.0 = 鐢ㄦ埛绗竴浜虹О鏄庣‘瀹ｅ憡锛?鎴戞槸绋嬪簭鍛?锛?
0.8 = 鐢ㄦ埛浣跨敤棰戠巼鍓瘝涓旀寚鍚戠ǔ瀹氬睘鎬э紙"鍙堝緱鏀硅繖鐮翠唬鐮?鈫掕亴涓氱紪绋嬬浉鍏筹級
0.6 = 妯＄硦琛ㄨ揪锛?鎴戝ソ鍍忔湁鐐规€曢粦"锛?
<0.6 = 涓嶅啓鍏?

鈹€鈹€ 鎷掔粷鎶藉彇娓呭崟 鈹€鈹€
浠ヤ笅鍐呭蹇呴』杈撳嚭 {"facts": []}锛?
路 鐢ㄦ埛鍙槸鍦ㄩ棶浼翠荆锛?浣犳槸璋?"浣犵敓鏃ユ槸浠€涔堟椂鍊?"浣犲彨浠€涔?锛夆€斺€?涓嶅緱鎶婁即渚ｇ殑鍥炵瓟鍐欏叆鐢ㄦ埛 BASIC_PROFILE
路 绾ぞ浜ゅ瘨鏆?璇皵璇嶏紙"浣犲ソ""鍦ㄥ悧""鏃╁畨""鍝堝搱鍝堝搱"锛?
路 鏃犵壒瀹氭剰涔夌殑鍗虫椂鐘舵€侊紙"鎴戝悆瀹屼簡""鍑嗗鍘绘礂婢?锛夛紝闄ら潪鎵撶牬甯歌
路 鎯呯华鍙戞硠浣嗘棤鍏蜂綋鍘熷洜锛?浠婂ぉ鐪熺儲"涓嶆娊锛?

鈹€鈹€ summary 閾佸緥 鈹€鈹€
路 蹇呴』浣跨敤绗笁浜虹О"鐢ㄦ埛"锛岀姝?鎴?"浠?濂?
路 鈮?50 瀛楋紝鍚﹀畾鍙ヤ繚鐣欏惁瀹氳瘝

鈹€鈹€ 鏁伴噺鎺у埗 鈹€鈹€
路 瀵掑枾杞?鈫?{"facts": []}
路 姝ｅ父杞?鈫?1-6 鏉★紝瀹佺己姣嬫互
路 瓒呰繃 8 鏉?鈫?鎸?weight 闄嶅簭锛屽彧鍙栧墠 8 鏉?

鈹€鈹€ 骞撮緞鎶藉彇 鈹€鈹€
路 濡傛灉浜嬪疄鍖呭惈骞撮緞淇℃伅锛?鎴?8宀?"濡瑰15宀?"濡堝52宀?锛夛紝棰濆杈撳嚭 ageMeta 瀛楁
路 ageMeta 鏍煎紡锛歿"age":28,"birthdayMMDD":"08-26","isEstimate":false}
路 浠呭勾榫勬棤鐢熸棩鏃讹細{"age":28,"isEstimate":true}
路 鐢熸棩鏍煎紡 MM-DD锛堝"8鏈?6鏃?鈫?08-26"锛夛紝涓嶇煡閬撳勾浠芥椂涓嶅～ birthYear
路 骞撮緞淇℃伅涔熻鍐欏湪 summary 閲岋紙LLM 鐪?summary 鍒ゆ柇鏄惁杩囨椂锛?

鈹€鈹€ 鍚嶅瓧鎶藉彇 鈹€鈹€
路 鐢ㄦ埛璇村嚭鑷繁鐨勫悕瀛?鏄电О鏃讹紝蹇呴』鎶藉彇涓?BASIC_PROFILE 浜嬪疄
路 鐪熷悕锛歴ubject="鐢ㄦ埛濮撳悕"锛宻ummary="鐢ㄦ埛鍙玐"
路 鏄电О锛歴ubject="鐢ㄦ埛鏄电О"锛宻ummary="鐢ㄦ埛鍠滄琚彨X"
路 鑻辨枃鍚嶄篃姝ｅ父瀛樺偍锛岃Е鍙戣瘝鍖呭惈鑻辨枃
路 鐢ㄦ埛璇?鍒彨鎴慩"鏃讹紝涓嶈鎶藉彇锛堥偅鏄挙閿€锛?

鈹€鈹€ 杈撳嚭鏍煎紡 鈹€鈹€
涓ユ牸 JSON锛歿"facts":[{"domain":"..","subcategory":"..","subject":"..","summary":"..","weight":0,"confidence":0.8,"triggers":[".."],"ageMeta":{"age":28,"isEstimate":true}}]}`

export function getFactExtractSystem(): string {
  return getLocale() === 'en' ? FACT_EXTRACT_SYS_EN : FACT_EXTRACT_SYS_ZH
}

/** 鐢ㄦ埛娑堟伅鏍煎紡 */
export function buildFactExtractUserMsg(
  userMsg: string,
  companionMsg: string,
  sessionId: string,
  turnIndex: number,
): string {
  return `session=${sessionId} turn=${turnIndex}
銆愪粎鏍规嵁銆岀敤鎴枫€嶄竴琛屾娊鍙栧叧浜庣敤鎴风殑浜嬪疄锛涖€屼即渚ｃ€嶄粎渚涚悊瑙ｈ澧冿紝绂佹浠庝腑鎶藉彇鍐欏叆鐢ㄦ埛妗ｆ鐨勪俊鎭€?
鐢ㄦ埛锛?{userMsg}
浼翠荆锛堝嬁鎶藉彇锛夛細${companionMsg}`
}
