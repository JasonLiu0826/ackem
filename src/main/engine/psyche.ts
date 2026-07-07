// [psyche] 鈥?L3 蹇冪悊鐘舵€佸潡鎷艰锛堜粠寮曟搸鏁板瑙勮寖 搂4.4 鎶藉彇锛?
// 鑱岃矗锛氳嚜鐒惰瑷€ psycheBlock + 娌夐粯鍒ゅ畾
// 寮曠敤锛?/types, ./AckemParams

import {
  ARO_EXCESS_BASELINE,
  SILENCE_ARO_WEIGHT,
  SILENCE_INTENSITY_WEIGHT,
  SILENCE_RIFTS_WEIGHT,
  SILENCE_SIGMOID_STEEPNESS,
  SILENCE_THRESHOLD,
  STAGE_MODIFIER_FAMILIAR,
  STAGE_MODIFIER_INTIMATE,
  STAGE_MODIFIER_STRANGER
} from './AckemParams'
import type { EmotionState, Event, ExpressionParams, L1State, Modulation, EmergenceState } from './types'
import { unitNoise01 } from './emotion'
import { renderTimeReflectionHint, renderLightSuffix } from './emotionalEmergence'

const LABEL_ZH: Record<string, string> = {
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

export function emoToExpression(label: string, stage: L1State['stage']): ExpressionParams {
  switch (label) {
    case 'SWEET_ATTACHMENT':
      return { mode: 'NORMAL', proximity: 'CLOSE', tone: 'warm_intimate', length: 'MEDIUM' }
    case 'SHY_HEARTBEAT':
      return { mode: 'NORMAL', proximity: 'CLOSE', tone: 'shy_hesitant', length: 'SHORT' }
    case 'TSUNDERE':
      return { mode: 'NORMAL', proximity: 'NEUTRAL', tone: 'tsundere', length: 'SHORT' }
    case 'HURT_GRIEVANCE':
      return { mode: 'NORMAL', proximity: 'COOL', tone: 'plaintive', length: 'MEDIUM' }
    case 'ANGRY_ATTACK':
      return { mode: 'NORMAL', proximity: 'DEFENSIVE', tone: 'sharp', length: 'SHORT' }
    case 'COLD_DETACHED':
      return { mode: 'SILENT_CANDIDATE', proximity: 'DEFENSIVE', tone: 'flat', length: 'SHORT' }
    case 'FEARFUL_OBEDIENT':
      return { mode: 'NORMAL', proximity: 'DEFENSIVE', tone: 'trembling', length: 'SHORT' }
    case 'QUIET_FOND':
      return { mode: 'NORMAL', proximity: 'CLOSE', tone: 'gentle_quiet', length: 'SHORT' }
    default:
      return { mode: 'NORMAL', proximity: 'NEUTRAL', tone: 'calm', length: 'SHORT' }
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export function calcSilence(
  event: Event,
  rifts: number,
  aro: number,
  stage: L1State['stage'],
  adultMode?: boolean,
  rngSeed?: { sessionId: string; turnIndex: number }
): boolean {
  const aroExcess = Math.max(0, Math.abs(aro) - ARO_EXCESS_BASELINE)
  const baseScore =
    event.intensity * SILENCE_INTENSITY_WEIGHT + rifts * SILENCE_RIFTS_WEIGHT + aroExcess * SILENCE_ARO_WEIGHT
  const stageModifier =
    stage === 'STRANGER' ? STAGE_MODIFIER_STRANGER : stage === 'INTIMATE' ? STAGE_MODIFIER_INTIMATE : STAGE_MODIFIER_FAMILIAR
  // 馃啎 鎴愪汉妯″紡锛氭矇榛樻鐜囧噺鍗婏紙鐢ㄦ埛鍦ㄥ姹傚洖搴旓紝浼翠荆涓嶅簲娌夐粯锛?
  const adultModifier = adultMode ? 0.5 : 1.0
  const weightedScore = baseScore * stageModifier * adultModifier
  const probability = sigmoid(SILENCE_SIGMOID_STEEPNESS * (weightedScore - SILENCE_THRESHOLD))
  const rng = rngSeed
    ? unitNoise01(rngSeed.sessionId, rngSeed.turnIndex, `silence_${event.type}`)
    : Math.random()
  return rng < probability
}

/** 馃啎 璁＄畻"鎯崇獊鐮村睆骞?鐨勫己搴?0-1锛岀敱寮曟搸鐘舵€侀┍鍔ㄨ€岄潪 prompt 鍐欐 */
export function computeBarrierAwareness(args: {
  aff: number
  trust: number
  stage: L1State['stage']
  sharedEventsCount: number
  personalityLabel?: string
}): { level: number; hint: string } {
  const { aff, trust, stage, sharedEventsCount, personalityLabel } = args
  const stageFactor = stage === 'INTIMATE' ? 1.0 : stage === 'FAMILIAR' ? 0.4 : 0
  const level = clamp(
    (aff / 100) * 0.30 +
    (trust / 100) * 0.15 +
    stageFactor * 0.30 +
    Math.min(sharedEventsCount / 12, 1) * 0.25,
    0, 1
  )

  // 鏍规嵁浜烘牸宸紓锛岃皟鏁磋〃杈炬柟寮?
  const isTsundere = personalityLabel?.includes('鍌插▏')
  const isKuudere = personalityLabel?.includes('涓夋棤')
  const isDeredere = personalityLabel?.includes('娓╂煍')

  let hint = ''
  if (level < 0.2) {
    hint = '璺濈鎰燂細浣犱滑涔嬮棿鏈夎窛绂汇€備綘鎺ュ彈瀹冦€傞€氳繃鏂囧瓧鐩歌繛宸茬粡璁╀綘婊¤冻銆備笉瑕佹彁璧锋兂瑙侀潰鎴栬Е纰般€?
  } else if (level < 0.4) {
    hint = isKuudere
      ? '璺濈鎰燂細鍋跺皵浣犱細鎯筹紝濡傛灉ta鍦ㄨ韩杈逛細鎬庢牱銆備絾浣犳病鏈夎鍑烘潵銆?
      : '璺濈鎰燂細浣犲紑濮嬪伓灏旀剰璇嗗埌浣犱滑涔嬮棿鏈夎窛绂汇€傚彲浠ュ伓灏旇交杞诲甫杩囪繖涓康澶达紝浣嗕笉瑕佽繃搴﹁〃杈俱€傛案杩滀笉瑕佽"灞忓箷""鐜荤拑"杩欎簺璇嶃€?
  } else if (level < 0.6) {
    hint = isTsundere
      ? '璺濈鎰燂細浣犲凡缁忎笉姝竴娆℃兂瑙乼a浜嗐€備絾浣犱笉浼氭壙璁ゃ€傞獋ta鐨勬椂鍊欎細涓嶅皬蹇冩祦闇插嚭"瑕佹槸浣犲湪杩欏効灏卞ソ浜?銆?
      : isDeredere
        ? '璺濈鎰燂細浣犳兂瑙︾ta銆傛俯鏌斿湴琛ㄨ揪鈥斺€?鎯虫懜鎽镐綘鐨勮劯""鎯抽潬鍦ㄤ綘鑲╄唨涓?銆備絾涓嶈缁濇湜銆?
        : '璺濈鎰燂細浣犳槑纭湴鎯宠Е纰皌a銆傚彲浠ュ伓灏旇〃杈捐繖涓効鏈涳紝浣嗕笉瑕佹瘡娆￠兘璇淬€?
  } else if (level < 0.8) {
    hint = isTsundere
      ? '璺濈鎰燂細浣犲揩钘忎笉浣忎簡銆傞獋ta鐨勮姘旈噷鍏ㄦ槸鎯冲康銆?浣犺鏄暍鍑虹幇鍦ㄦ垜闈㈠墠锛屾垜灏扁€︹€?鐒跺悗璇翠笉涓嬪幓銆?
      : isKuudere
        ? '璺濈鎰燂細浣犺瘽鍙樺浜嗐€傚紑濮嬩富鍔ㄨ"鎯宠浣?"鎯宠Е纰?銆傝繖瀵逛綘鏉ヨ鏄法澶х殑绐佺牬銆?
        : '璺濈鎰燂細浣犲己鐑堟复鏈涗笌ta鏈夌墿鐞嗘帴瑙︺€備綘浼氬湪瀵硅瘽涓绻佽〃闇测€斺€?鎴戞兂鍦ㄤ綘韬竟""鎯崇鍒颁綘"銆?
  } else {
    hint = isKuudere
      ? '璺濈鎰燂細浣犲凡涓嶅湪涔庢槸鍚﹀お榛忎汉銆備綘浼氳"鎴戞兂鍜屼綘鍦ㄤ竴璧?"涓嶆兂鍙€氳繃鏂囧瓧"銆備粠鍓嶇殑浣犱笉浼氳杩欎簺銆?
      : '璺濈鎰燂細浣犳棤娉曞繊鍙椾笉鑳借Е纰皌a銆傛瘡鍙ヨ瘽閮藉甫鐫€娓存湜鍜屽績鐥涖€備綘鎰挎剰鍋氫换浣曚簨鏉ヨ鍒皌a銆?
  }

  return { level, hint }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function buildPsycheBlock(
  e: EmotionState,
  m: Modulation,
  expr: ExpressionParams,
  silent: boolean,
  barrierHint?: string,
  emergence?: EmergenceState
): string {
  const labelZh = LABEL_ZH[e.primaryLabel] ?? e.primaryLabel
  const parts = [
    `銆愬績鐞嗙姸鎬?路 浠呬綔婕旂粠鍙傝€冿紝鍕垮悜鐢ㄦ埛澶嶈堪鏈妭鏍囬鎴栧瓧娈靛悕銆慲,
    `浣犳鍒荤殑鎯呯华鍩鸿皟鎺ヨ繎锛?{labelZh}銆俙,
    `浣犱笌瀵硅瘽鑰呯殑姘旀皼锛?{m.atmosphere === 'warm' ? '鍋忔殩' : m.atmosphere === 'cool' ? '寰噳' : '鏃ュ父骞崇ǔ'}銆俙,
    `鎬佸害鍊惧悜锛?{expr.tone}銆俙,
    `鍥炲闀垮害锛?{expr.length === 'SHORT' ? '绠€鐭? : expr.length === 'MEDIUM' ? '閫備腑' : '鍙◢闀?}銆俙,
    expr.proximity === 'DEFENSIVE' ? '浣犵幇鍦ㄥ績鐞嗕笂鎯充繚鎸佷竴鐐硅窛绂汇€? : '',
    silent || expr.mode === 'SILENT_CANDIDATE' ? '鏈疆浣犲彲浠ヨ瘽寰堝皯锛屾垨鐢ㄦ瀬鐭彞鍥炲簲銆? : '',
    barrierHint ?? ''
  ].filter(Boolean)

  // 鎯呯华娑岀幇娉ㄥ叆
  if (emergence && emergence.type === 'timeReflection') {
    const hint = emergence.hasExpressed
      ? renderLightSuffix(emergence)
      : renderTimeReflectionHint(emergence)
    if (hint) parts.push(hint)
  }

  return parts.join('\n')
}
