import { DOMAINS, SUBCATEGORIES } from '../memory/taxonomy'

export const DOCUMENT_IMPORT_TEMPERATURE = 0.15
export const DOCUMENT_IMPORT_MAX_CHARS = 5_500
export const DOCUMENT_IMPORT_MAX_FACTS_PER_CHUNK = 22
export const DOCUMENT_IMPORT_MAX_EPISODES_PER_CHUNK = 4
export const DOCUMENT_IMPORT_MAX_ANCHORS_PER_CHUNK = 6

const DOMAIN_LIST = DOMAINS.join(', ')
const SUBCAT_LINES = Object.entries(SUBCATEGORIES)
  .map(([d, arr]) => `${d}: ${(arr as readonly string[]).join(', ')}`)
  .join('\n')

export const DOCUMENT_IMPORT_SYS_ZH = `浣犳槸 Ackem 鐨勩€屽閮ㄦ。妗堣蹇嗚В鏋愬櫒銆嶃€傜敤鎴蜂笂浼犱簡鍏充簬**鑷繁**鐨勮嚜杩?鏃ヨ/绠€鍘?鑱婂ぉ璁板綍鏁寸悊锛岃鎶藉彇鍙暱鏈熶娇鐢ㄧ殑缁撴瀯鍖栬蹇嗐€?

鈹€鈹€ 鍘熷垯 鈹€鈹€
路 鍏ㄦ枃涓讳綋鏄€岀敤鎴枫€嶆湰浜猴紙绗竴浜虹О銆屾垜銆嶆垨绗笁浜虹О銆屼粬/濂?鏋楁櫄銆嶅潎瑙嗕负鐢ㄦ埛锛夈€?
路 浣跨敤涓庡璇?ingest 鐩稿悓鐨?taxonomy锛坉omain + subcategory锛夛紝瑙佷笅鏂瑰垪琛ㄣ€?
路 绂佹鍐欏叆 Ackem 鍒涢€犺€?Jason / 鐖朵翰 Canon锛涚姝㈣櫄鏋勬枃涓病鏈夌殑淇℃伅銆?
路 闄ら潪鏂囦腑鏄庣‘鎻愬埌涓?Ackem/AI 浼翠荆鐨勪簰鍔紝鍚﹀垯涓嶈鍐?OUR_BOND銆?
路 鍘嗗彶浜嬩欢 鈫?LIFE_STORY 鎴?episodes锛涚ǔ瀹氬睘鎬?鈫?BASIC_PROFILE / FAMILY / TASTES 绛夈€?
路 MOOD/NOW 浠呭綋鏂囦腑鏄庣‘銆屾渶杩?鐩墠/杩欏嚑澶┿€嶇殑鐭殏鐘舵€侊紱鍚﹀垯鐢?TASTES/LIFE_STORY銆?
路 浜虹墿锛歴ubject 鐢ㄧǔ瀹氶敭锛堝銆岀敤鎴锋瘝浜层€嶃€屾湅鍙?鍛ㄧ劧銆嶃€岀敤鎴锋湰浜恒€嶏級銆?
路 weight 0-3銆乧onfidence 0.0-1.0锛涘鍏ユ潵婧愰粯璁?confidence 0.55-0.72锛屾牳蹇冭韩浠藉彲鍒?0.8銆?
路 鐢熸棩/绾康鏃ュ啓鍏?anchors锛涘鍙ュ彊浜嬩簨浠跺啓鍏?episodes銆?

鈹€鈹€ 棰嗗煙涓庡瓙绫?鈹€鈹€
${DOMAIN_LIST}
${SUBCAT_LINES}

鈹€鈹€ 杈撳嚭 JSON锛堜粎 JSON锛屾棤 markdown锛夆攢鈹€
{
  "facts": [
    {
      "domain": "IDENTITY",
      "subcategory": "BASIC_PROFILE",
      "subject": "鐢ㄦ埛鏈汉",
      "summary": "29宀侊紝涓婃捣娴︿笢鍋氫骇鍝佺粡鐞?,
      "weight": 2,
      "confidence": 0.7,
      "triggers": ["浜у搧缁忕悊","涓婃捣"],
      "sourceQuote": "鍘熸枃涓€鍙モ墹80瀛?
    }
  ],
  "episodes": [
    {
      "summary": "2021骞寸涓庡墠浠诲垎鎵嬶紝姝ゅ悗涓ゅ勾鏈亱鐖?,
      "emotionalIntensity": 0.6,
      "dominantEmotion": "melancholy",
      "keywords": ["鍒嗘墜","2021"],
      "timeRange": "2021-09"
    }
  ],
  "anchors": [
    {
      "type": "birthday",
      "label": "鐢ㄦ埛鐢熸棩",
      "monthDay": "03-15",
      "year": 1997,
      "summary": "1997骞?鏈?5鏃ュ嚭鐢?
    }
  ]
}

facts 鏈€澶?${DOCUMENT_IMPORT_MAX_FACTS_PER_CHUNK} 鏉★紱episodes 鏈€澶?${DOCUMENT_IMPORT_MAX_EPISODES_PER_CHUNK} 鏉★紱anchors 鏈€澶?${DOCUMENT_IMPORT_MAX_ANCHORS_PER_CHUNK} 鏉°€俙

export function buildDocumentImportUserMsg(args: {
  sourceFile: string
  chunkIndex: number
  chunkTotal: number
  text: string
}): string {
  return [
    `鏉ユ簮鏂囦欢锛?{args.sourceFile}`,
    `鐗囨锛?{args.chunkIndex + 1}/${args.chunkTotal}`,
    '',
    '銆愮敤鎴锋彁渚涚殑妗ｆ姝ｆ枃銆?,
    args.text.slice(0, DOCUMENT_IMPORT_MAX_CHARS),
  ].join('\n')
}
