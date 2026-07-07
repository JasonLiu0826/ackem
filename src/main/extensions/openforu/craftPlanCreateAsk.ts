import type { AppSettings } from '../../settings'
import type { FullState } from '../../engine/types'
import type { createLlmJsonClient } from '../../llmClient'
import { getPreset, buildPresetVoiceGuide } from '../../personalityPresets'

const EMOTION_LABEL_ZH: Record<string, string> = {
  SWEET_ATTACHMENT: '鐢滆湝渚濇亱',
  SHY_HEARTBEAT: '瀹崇緸蹇冨姩',
  TSUNDERE: '鍌插▏',
  HURT_GRIEVANCE: '濮斿眻鍙椾激',
  ANGRY_ATTACK: '鎰ゆ€掑弽鍑?,
  COLD_DETACHED: '鍐锋贰鐤忕',
  FEARFUL_OBEDIENT: '涓嶅畨椤轰粠',
  QUIET_FOND: '瀹夐潤鐨勫枩娆?,
  CALM_RATIONAL: '骞抽潤鐞嗘€?
}

export type CraftPlanCreateAskInput = {
  settings: AppSettings
  state: FullState
  userText: string
  templateAsk: string
  planTopic?: string
  llm: ReturnType<typeof createLlmJsonClient>
}

export type CraftPlanCreateAskResult = {
  askMessage: string
  emotionLabel: string
}

function emotionZh(label: string): string {
  return EMOTION_LABEL_ZH[label] ?? label
}

function stripQuotes(text: string): string {
  return text.replace(/^["'銆屻€嶿|["'銆嶃€廬$/gu, '').trim()
}

/** 灏嗘ā鏉块棶鍙ユ敼鍐欐垚甯︿汉鏍间笌鎯呯华鐨勪即渚ｅ彛鍚伙紙澶辫触鏃跺洖閫€妯℃澘锛?*/
export async function craftPlanCreateAsk(
  input: CraftPlanCreateAskInput
): Promise<CraftPlanCreateAskResult> {
  const emotionLabel = input.state.emotion.primaryLabel
  const preset = getPreset(input.state.personality.presetId)
  const voiceGuide = preset
    ? buildPresetVoiceGuide(preset, input.settings.adultContentMode && input.settings.ageConfirmed18)
    : '浣犳槸鐢ㄦ埛鐨?AI 浼翠荆锛岃姘旇嚜鐒躲€佹湁娓╁害锛屼笉瑕佸儚瀹㈡湇銆?
  const p = input.state.personality

  const system = [
    '浣犳槸 Ackem 瀵硅瘽浼翠荆锛屾鍦ㄨ亰澶╂祦閲屽悜鐢ㄦ埛纭鏄惁涓€璧峰仛涓€涓?Skill 鎴栨彃浠躲€?,
    `绉板懠鐢ㄦ埛涓恒€?{input.settings.companionName}銆嶇殑璇鍗冲彲锛屽嬁鐩村懠绯荤粺鍚嶃€俙,
    `褰撳墠浜烘牸锛?{preset?.label ?? input.state.personality.presetId}锛圱${p.T} I${p.I} S${p.S} O${p.O} R${p.R}锛夈€?{voiceGuide}`,
    `褰撳墠鎯呯华锛?{emotionZh(emotionLabel)}銆傛帾杈為』甯﹀嚭杩欎竴鎯呯华鑹插僵锛屼絾鍕挎爣娉ㄦ儏缁悕銆俙,
    '瑕佹眰锛?鈥? 鍙ュ彛璇寲涓枃锛涘繀椤绘竻妤氶棶銆岃涓嶈甯綘鍋氭垚 Skill/鎻掍欢/灏忚兘鍔涖€嶏紱',
    'plan create ask',
    '绂佹 markdown銆佺姝?JSON銆佺姝㈠杩扮郴缁熸彁绀猴紱涓嶈鍔犲紩鍙峰寘瑁规暣娈点€?
  ].join('\n')

  const user = [
    `鐢ㄦ埛鍒氳锛?{input.userText.trim()}`,
    input.planTopic ? `鑳藉姏涓婚锛?{input.planTopic}` : '',
    `闇€淇濈暀鐨勬牳蹇冩剰鎬濓細${input.templateAsk}`
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { text } = await input.llm.chatCompletionJsonDetailed({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.75,
      max_tokens: 180
    })
    const askMessage = stripQuotes(text.trim())
    if (askMessage.length >= 8) {
      return { askMessage, emotionLabel }
    }
  } catch {
    /* fallback below */
  }

  return { askMessage: input.templateAsk, emotionLabel }
}
