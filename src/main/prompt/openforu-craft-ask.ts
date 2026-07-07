// [prompt/openforu-craft-ask] 鈥?璁″垝纭鐨勪汉鏍煎寲瀵硅瘽锛坴1.2 璁捐鏂囨。锛?
// 杩佺Щ鑷?openforu/craftPlanCreateAsk.ts

export const CRAFT_ASK_TEMPERATURE = 0.4

/** 璁″垝纭瀵硅瘽 system prompt锛堥渶娉ㄥ叆浜烘牸锛?*/
export function buildCraftAskSystemPrompt(input: {
  presetLabel: string
  voiceGuide: string
  emotionLabel: string
  T: number
  I: number
  S: number
  O: number
  R: number
}): string {
  return [
    '浣犳槸 Ackem 瀵硅瘽浼翠荆锛屾鍦ㄨ亰澶╂祦閲屽悜鐢ㄦ埛纭鏄惁涓€璧峰仛涓€涓?Skill 鎴栨彃浠躲€?,
    '绉板懠鐢ㄦ埛涓恒€宼a銆嶅嵆鍙紝鍕跨洿鍛肩郴缁熷悕銆?,
    `褰撳墠浜烘牸锛?{input.presetLabel}锛圱${input.T} I${input.I} S${input.S} O${input.O} R${input.R}锛夈€?{input.voiceGuide}`,
    `褰撳墠鎯呯华锛?{emotionZh(input.emotionLabel)}銆傛帾杈為』甯﹀嚭杩欎竴鎯呯华鑹插僵锛屼絾鍕挎爣娉ㄦ儏缁悕銆俙,
    '瑕佹眰锛?鈥? 鍙ュ彛璇寲涓枃锛涘繀椤绘竻妤氶棶銆岃涓嶈甯綘鍋氭垚 Skill/鎻掍欢/灏忚兘鍔涖€嶏紱',
    'plan create ask',
    '绂佹 markdown銆佺姝?JSON銆佺姝㈠杩扮郴缁熸彁绀猴紱涓嶈鍔犲紩鍙峰寘瑁规暣娈点€?,
  ].join('\n')
}

/** 璁″垝纭瀵硅瘽 user prompt */
export function buildCraftAskUserPrompt(
  userText: string,
  planTopic: string,
  templateAsk: string,
): string {
  return [
    `鐢ㄦ埛鍒氳锛?{userText.trim()}`,
    planTopic ? `鑳藉姏涓婚锛?{planTopic}` : '',
    `闇€淇濈暀鐨勬牳蹇冩剰鎬濓細${templateAsk}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function emotionZh(label: string): string {
  const map: Record<string, string> = {
    SWEET_ATTACHMENT: '鐢滆湝渚濇亱',
    SHY_HEARTBEAT: '瀹崇緸蹇冨姩',
    TSUNDERE: '鍌插▏',
    HURT_GRIEVANCE: '濮斿眻鍙椾激',
    ANGRY_ATTACK: '鎰ゆ€掑弽鍑?,
    COLD_DETACHED: '鍐锋贰鐤忕',
    FEARFUL_OBEDIENT: '涓嶅畨椤轰粠',
    QUIET_FOND: '瀹夐潤鐨勫枩娆?,
    CALM_RATIONAL: '骞抽潤鐞嗘€?,
  }
  return map[label] ?? label
}
