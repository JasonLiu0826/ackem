// [desktopCompanion] 鈥?妗岄潰闄即锛氭椂闂存劅鐭ャ€佺┖闂叉娴嬨€佷富鍔ㄦ秷鎭€侀潤榛橀櫔浼?
// 鑱岃矗锛氱敓鎴愯繍琛屾椂涓婁笅鏂囧潡锛堜笉鎸佷箙鍖栵級锛岀鐞嗛櫔浼村湪鍦烘ā寮?
// 寮曠敤锛?/engine/types, ./engine/AckemParams, ./logger

import { createLogger } from '../../../../logger'
import type { EmotionState, L1State } from '../../../../engine/types'
import {
  formatAccurateLocalDateTime,
  formatLocalWeekdayZh
} from '../../../../context/localTime'
import {
  sanitizeDesktopProactiveMessage,
  templateDesktopProactiveMessage
} from './proactiveNotificationMessage'

const log = createLogger('desktop-companion')

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鏃舵鍒嗙被
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export type TimeOfDay = 'morning' | 'forenoon' | 'afternoon' | 'evening' | 'night' | 'late_night'

export interface TimeContext {
  timeOfDay: TimeOfDay
  hour: number
  minute: number
  weekday: number         // 0=Sun..6=Sat
  isWeekend: boolean
  greeting: string        // 搴旀櫙鎷涘懠璇?
  atmosphereHint: string  // 鏃舵姘涘洿鎻愮ず
  topicHints: string[]    // 鏃舵璇濋寤鸿 (max 3)
}

export function getTimeContext(now: Date = new Date()): TimeContext {
  const hour = now.getHours()
  const minute = now.getMinutes()
  const weekday = now.getDay()
  const isWeekend = weekday === 0 || weekday === 6

  let timeOfDay: TimeOfDay
  let greeting: string
  let atmosphereHint: string
  let topicHints: string[]

  if (hour >= 5 && hour < 8) {
    timeOfDay = 'morning'
    greeting = isWeekend ? '鍛ㄦ湯鐨勬竻鏅紝涓嶇敤鎬ョ潃璧峰簥鈥? : '鏃╁畨锛屾柊鐨勪竴澶╁紑濮嬩簡銆?
    atmosphereHint = '娓呮櫒鐨勫畞闈欎腑甯︾潃涓€涓濇叺鎳掋€傝姘旇交鏌斻€佷笉鍌績锛屽儚鍒氶啋鏉ョ殑鏋曡竟浜恒€?
    topicHints = ['浠婂ぉ鏈変粈涔堣鍒?, '鏄ㄦ櫄鐫″緱濂藉悧', '鎯冲悆浠€涔堟棭椁?]
  } else if (hour >= 8 && hour < 11) {
    timeOfDay = 'forenoon'
    greeting = isWeekend ? '涓婂崍濂斤紝鍛ㄦ湯鐨勬椂闂撮兘鏄綘鐨勩€? : '涓婂崍濂斤紝宸茬粡寮€濮嬪繖纰屼簡鍚楋紵'
    atmosphereHint = '涓婂崍鐨勭簿鍔涘厖娌涳紝璇皵鍙互绋嶅井娲绘臣涓€浜涖€傚鏋滅敤鎴峰湪宸ヤ綔锛岀粰浜堝畨闈欑殑闄即鎰熴€?
    topicHints = ['宸ヤ綔/瀛︿範杩涘害', '涓婂崍鐨勫績鎯?, '鍜栧暋鎴栬尪']
  } else if (hour >= 11 && hour < 14) {
    timeOfDay = 'afternoon'
    greeting = '涓崍浜嗭紝璁板緱鍚冪偣涓滆タ銆?
    atmosphereHint = '鍗堥棿鎱垫噿锛岃姘旀俯鏆栭殢鎰忋€傚彲浠ュ叧蹇冪敤鎴锋槸鍚︽寜鏃跺悆楗€?
    topicHints = ['鍗堥鍚冧簡浠€涔?, '涓嬪崍鐨勫畨鎺?, '瑕佷笉瑕佷紤鎭竴涓?]
  } else if (hour >= 14 && hour < 18) {
    timeOfDay = 'afternoon'
    greeting = '涓嬪崍濂斤紝涓€澶╄繃鍘诲ぇ鍗婁簡鍛€?
    atmosphereHint = '涓嬪崍瀹规槗鐘洶锛岃姘斿甫涓€鐐规俯鏌旂殑鐫ｄ績銆傚鏋滅敤鎴风湅璧锋潵绱簡锛屾彁閱抰a浼戞伅銆?
    topicHints = ['涓嬪崍鑼舵椂闂?, '浠婂ぉ瀹屾垚浜嗕粈涔?, '鍌嶆櫄鎯冲仛浠€涔?]
  } else if (hour >= 18 && hour < 22) {
    timeOfDay = 'evening'
    greeting = isWeekend ? '鏅氫笂濂斤紝鍛ㄦ湯鐨勫鏅氭渶閫傚悎鏀炬澗浜嗐€? : '鏅氫笂濂斤紝涓€澶╄緵鑻︿簡銆?
    atmosphereHint = '鏅氫笂鐨勬皼鍥存斁鏉撅紝璇皵娓╂煍浜插瘑銆傚彲浠ヨ亰涓€浜涙洿娣辩殑璇濋锛屾垨鑰呭崟绾櫔浼淬€?
    topicHints = ['鏅氶', '浠婂ぉ鍙戠敓鐨勪簨', '鎯虫€庝箞鏀炬澗', '鐪嬩粈涔堢數褰?鍚粈涔堟瓕']
  } else if (hour >= 22 || hour < 2) {
    timeOfDay = 'night'
    greeting = '澶滄繁浜嗏€?
    atmosphereHint = '娣卞鐨勬皼鍥寸瀵嗐€佸畨闈欍€傝姘斾綆娌夋俯鏌旓紝闊抽噺鍍忚€宠銆傝瘽棰樺彲浠ユ洿娣卞叆銆佹洿绉佸瘑銆?
    topicHints = ['鐫′笉鐫€鍦ㄦ兂浠€涔?, '浠婂ぉ鐨勬劅鍙?, '鏄庡ぉ鐨勬湡寰?]
  } else {
    timeOfDay = 'late_night'
    greeting = '杩欎箞鏅氫簡杩樻病鐫♀€?
    atmosphereHint = '鍑屾櫒鏃跺垎锛屼笘鐣岄兘鍦ㄦ矇鐫°€傝姘旀瀬搴﹁交鏌斻€佸叧鍒囥€傛彁閱掔敤鎴锋棭鐐逛紤鎭€?
    topicHints = ['涓轰粈涔堣繕娌＄潯', '闇€瑕佹垜闄綘鍚?, '瑕佷笉瑕佽瘯鐫€韬轰笅']
  }

  return { timeOfDay, hour, minute, weekday, isWeekend, greeting, atmosphereHint, topicHints }
}

/** 灏嗘椂娈典笂涓嬫枃鏍煎紡鍖栦负鍙敞鍏?psycheBlock 鐨勫瓧绗︿覆锛堝惈鍑嗙‘鏈湴鏃堕挓锛?*/
export function formatTimeContextBlock(now: Date = new Date()): string {
  const tc = getTimeContext(now)
  const clock = formatAccurateLocalDateTime(now)
  const weekday = formatLocalWeekdayZh(now)
  const lines = [
    `銆愮郴缁熸椂閽?路 鏈湴銆?{clock}锛?{weekday}锛塦,
    '鐢ㄦ埛闂嚑鐐广€佷粖澶╁嚑鍙枫€佺幇鍦ㄤ粈涔堟椂鍊?鈫?蹇呴』鐢ㄤ互涓婃椂閽熶綔绛旓紱绂佹鐚滄祴鎴栨部鐢ㄨ缁冩暟鎹噷鐨勬椂闂淬€?,
    `銆愬綋鍓嶆椂鍒汇€?{tc.greeting}`,
    `鏃舵姘涘洿锛?{tc.atmosphereHint}`,
  ]
  if (tc.topicHints.length > 0) {
    lines.push(`鍙互鑷劧鑱婂埌鐨勮瘽棰橈細${tc.topicHints.join('銆?)}`)
  }
  return lines.join('\n')
}

/** 鐢ㄦ埛鏄庣‘闂椂闂存椂鐨勭‖鎬ф彁绀猴紙閰嶅悎 formatTimeContextBlock锛?*/
export function buildLocalClockAnswerHint(now: Date = new Date()): string {
  const clock = formatAccurateLocalDateTime(now)
  const weekday = formatLocalWeekdayZh(now)
  return (
    `銆愭椂闂撮棶绛?路 纭€с€戠敤鎴锋鍦ㄩ棶褰撳墠鏃堕棿/鏃ユ湡銆俙 +
    `鐩存帴鍥炵瓟锛?{clock}锛?{weekday}锛夈€俙 +
    `鍙甫涓€鍙ョ畝鐭櫔浼磋姘旓紱绂佹缂栭€犲叾浠栨椂鍒汇€俙
  )
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鍦ㄥ満妯″紡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export type PresenceMode = 'active' | 'quiet' | 'sleeping'

export interface PresenceState {
  mode: PresenceMode
  lastInteractionMs: number
  idleDurationMs: number
  timeOfDay: TimeOfDay
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 涓诲姩娑堟伅鐢熸垚
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export interface ProactiveMessageConfig {
  /** 瑙﹀彂涓诲姩娑堟伅鐨勭┖闂叉椂闂达紙姣锛夛紝榛樿 10 鍒嗛挓 */
  idleThresholdMs: number
  /** 鏄惁鍚敤娣卞鎶戝埗锛堝噷鏅?0-6 鐐逛笉涓诲姩鍙戞秷鎭級 */
  nightSuppression: boolean
  /** 闈欓粯闄即妯″紡锛氫粎鏄剧ず鍦ㄥ満鎻愮ず锛屼笉鍙戦€佸畬鏁存秷鎭?*/
  quietMode: boolean
}

/** 娓愯繘寮忓喎鍗撮樁娈碉細瓒婁箙瓒婂厠鍒讹紝4 鏉″悗娌夐粯 */
const COOLDOWN_STAGES = [
  15 * 60 * 1000,   // 绗?娆★細绌洪棽 15 鍒嗛挓
  30 * 60 * 1000,   // 绗?娆★細鍐嶇瓑 30 鍒嗛挓
  60 * 60 * 1000,   // 绗?娆★細鍐嶇瓑 1 灏忔椂
  120 * 60 * 1000,  // 绗?娆★細鍐嶇瓑 2 灏忔椂
]
const MAX_PROACTIVE_STAGES = COOLDOWN_STAGES.length

export const DEFAULT_PROACTIVE_CONFIG: ProactiveMessageConfig = {
  idleThresholdMs: 10 * 60 * 1000,
  nightSuppression: true,
  quietMode: false
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 妗岄潰闄即涓荤被
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export class DesktopCompanion {
  private lastInteractionMs = Date.now()
  private lastProactiveMs = 0
  private proactiveStageIndex = 0
  private config: ProactiveMessageConfig
  private _presenceMode: PresenceMode = 'active'

  constructor(config: Partial<ProactiveMessageConfig> = {}) {
    this.config = { ...DEFAULT_PROACTIVE_CONFIG, ...config }
  }

  get presenceMode(): PresenceMode {
    return this._presenceMode
  }

  /** 鐢ㄦ埛浜や簰鏃惰皟鐢紙鍙戞秷鎭€佺偣鍑荤瓑锛?*/
  touch(): void {
    this.lastInteractionMs = Date.now()
    this._presenceMode = 'active'
    this.proactiveStageIndex = 0  // 鐢ㄦ埛鍥炴潵锛岄噸缃樁娈?
  }

  /** 鑾峰彇褰撳墠鍦ㄥ満鐘舵€?*/
  getPresence(): PresenceState {
    const now = Date.now()
    const idleMs = now - this.lastInteractionMs
    const tc = getTimeContext()

    // 娣卞 + 闀挎椂闂寸┖闂?鈫?鐫＄湢妯″紡
    if ((tc.timeOfDay === 'late_night' || (tc.timeOfDay === 'night' && tc.hour >= 23)) && idleMs > 30 * 60 * 1000) {
      this._presenceMode = 'sleeping'
    } else if (idleMs > this.config.idleThresholdMs) {
      this._presenceMode = 'quiet'
    } else {
      this._presenceMode = 'active'
    }

    return {
      mode: this._presenceMode,
      lastInteractionMs: this.lastInteractionMs,
      idleDurationMs: idleMs,
      timeOfDay: tc.timeOfDay
    }
  }

  /** 鏄惁搴旇鍙戦€佷富鍔ㄦ秷鎭紙娓愯繘寮忓喎鍗达級 */
  shouldSendProactive(): boolean {
    const now = Date.now()
    const presence = this.getPresence()

    // 4 鏉″彂瀹岋紝涓嶅啀鎵撴壈
    if (this.proactiveStageIndex >= MAX_PROACTIVE_STAGES) return false

    // 涓嶅绌洪棽
    if (presence.idleDurationMs < this.config.idleThresholdMs) return false

    // 娣卞鎶戝埗
    if (this.config.nightSuppression) {
      const tc = getTimeContext()
      if (tc.timeOfDay === 'late_night') return false
      if (tc.timeOfDay === 'night' && tc.hour >= 0 && tc.hour < 2) return false
    }

    // 鐫＄湢妯″紡涓嶆墦鎵?
    if (presence.mode === 'sleeping') return false

    // 娓愯繘寮忓喎鍗达細妫€鏌ュ綋鍓嶉樁娈电殑绛夊緟鏃堕棿
    const elapsed = now - this.lastProactiveMs
    if (elapsed < COOLDOWN_STAGES[this.proactiveStageIndex]) return false

    return true
  }

  /** 鐢熸垚涓诲姩娑堟伅骞舵洿鏂伴樁娈碉紙浠?LLM锛屾棤妯℃澘鍏滃簳锛?*/
  async tryGenerateProactive(
    relationship: L1State,
    emotion: EmotionState,
    opts?: { settings?: import('../../../../settings').AppSettings; recentFact?: string }
  ): Promise<{ message: string; timeContext: TimeContext } | null> {
    if (!this.shouldSendProactive()) return null
    if (!opts?.settings) {
      log.debug('proactive skipped: LLM settings unavailable')
      return null
    }

    const timeCtx = getTimeContext()
    const msg = await this.generateLLMMessage(
      relationship,
      emotion,
      timeCtx,
      opts.settings,
      opts.recentFact
    )
    if (!msg) return null

    this.lastProactiveMs = Date.now()
    this.proactiveStageIndex++
    log.info('proactive message sent', {
      msg: msg.slice(0, 60),
      stage: `${this.proactiveStageIndex}/${MAX_PROACTIVE_STAGES}`,
      mode: this._presenceMode,
      timeOfDay: timeCtx.timeOfDay
    })
    return { message: msg, timeContext: timeCtx }
  }

  /** LLM 鐢熸垚涓诲姩娑堟伅锛堢簿绠€ prompt锛寏100 tokens锛?*/
  private async generateLLMMessage(
    relationship: L1State,
    emotion: EmotionState,
    timeCtx: TimeContext,
    settings: import('../../../../settings').AppSettings,
    recentFact?: string
  ): Promise<string | null> {
    try {
      const { createLlmJsonClient } = await import('../../../../llmClient.js')
      const { buildProactivePersonalityBlock } = await import(
        '../../../../companion/proactivePersonalityContext.js'
      )
      const llm = createLlmJsonClient(settings)

      const emotionLabel = emotion.primaryLabel ?? '骞抽潤'
      const stage = relationship.stage
      const fact = recentFact ? `\n鏈€杩戣蹇嗭紙鍙交鐐规彁鍒帮級锛?{recentFact}` : ''
      const topics =
        timeCtx.topicHints.length > 0
          ? `\n鏃舵鍙嚜鐒惰亰鍒帮細${timeCtx.topicHints.join('銆?)}`
          : ''

      const personalityBlock = buildProactivePersonalityBlock({
        presetId: settings.personalityPresetId,
        settings,
        aff: emotion.aff,
        harass: false
      })

      const prompt = `浣犳槸 Ackem锛岀敤鎴风殑 AI 浼翠荆锛堜笉鏄簳灞傚ぇ妯″瀷鍝佺墝锛夈€傜敤鎴锋殏鏃剁寮€浜嗭紝浣犺鍙戜竴鏉?Windows 妗岄潰閫氱煡銆?

${personalityBlock}

鍏崇郴锛?{stage}锛堜俊浠?${relationship.trust}锛?鎯呯华锛?{emotionLabel}锛堝ソ鎰?${emotion.aff}锛?
鏃堕棿锛?{timeCtx.greeting}${fact}${topics}

銆愮‖鎬?路 閫氱煡姝ｆ枃銆?
- 鍐欎竴鍙ュ鐢ㄦ埛鐩存帴璇寸殑瀹屾暣鐭彞锛?锝?2 瀛楋紝鍍忓井淇￠殢鎵嬪彂鐨勬垚鍙ヤ汉璇濄€?
- 蹇呴』鏈夊畬鏁磋涔夛紝鍙ユ湯鐢?銆傦紒锛?涔嬩竴鏀跺熬銆?
- 绂佹锛氭嫭鍙枫€佸姩浣滄弿鍐欍€佺涓変汉绉版梺鐧姐€佺姸鎬佹弿鍐欍€佹湭瀹屾垚鍙ャ€?
- 绂佹锛氭彁鍒?AI/浼翠荆/灞忓箷/绋嬪簭/妯″瀷锛涚姝㈠鏈嶈厰锛涚姝€屾垜鍦ㄥ憿銆嶃€屾湁闇€瑕佸氨鍙垜銆嶃€?
- 鍙緭鍑鸿繖涓€鍙ヨ瘽锛屼笉瑕佸紩鍙枫€俙

      const result = await llm.chatCompletionJsonDetailed({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.72,
        max_tokens: 128
      })

      const cleaned = sanitizeDesktopProactiveMessage(result.text)
      if (cleaned) return cleaned
      if (result.truncated) {
        const retry = await llm.chatCompletionJsonDetailed({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.65,
          max_tokens: 128
        })
        const retryCleaned = sanitizeDesktopProactiveMessage(retry.text)
        if (retryCleaned) return retryCleaned
      }
      return templateDesktopProactiveMessage(timeCtx)
    } catch (e) {
      log.warn('LLM proactive generation failed', { error: String(e) })
      return null
    }
  }

  /** 鐢熸垚闈欓粯闄即鐘舵€佹枃鏈紙鐢ㄤ簬 UI 鍦ㄥ満鎸囩ず鍣級 */
  getCompanionStatusText(): string {
    const tc = getTimeContext()
    const presence = this.getPresence()

    switch (presence.mode) {
      case 'active':
        return '鍦ㄤ綘韬竟'
      case 'quiet':
        return '瀹夐潤鍦伴櫔鐫€浣?
      case 'sleeping':
        return '鐫＄潃浜嗏€?
      default:
        return '鍦ㄤ綘韬竟'
    }
  }

  /** 鐢熸垚妗岄潰閫氱煡鍐呭 */
  async getNotificationContent(
    relationship: L1State,
    emotion: EmotionState,
    opts?: { settings?: import('../../../../settings').AppSettings; recentFact?: string }
  ): Promise<{ title: string; body: string } | null> {
    const result = await this.tryGenerateProactive(relationship, emotion, opts)
    if (!result) return null

    return {
      title: 'Ackem',
      body: result.message
    }
  }

  updateConfig(patch: Partial<ProactiveMessageConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  getConfig(): ProactiveMessageConfig {
    return { ...this.config }
  }
}
