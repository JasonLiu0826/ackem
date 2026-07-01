/**
 * Emotion label → CosyVoice instruction mapping.
 *
 * Maps L2 emotion layer labels to Chinese natural language instructions
 * for CosyVoice-300M-Instruct's instruction-based emotion control.
 */

/** Emotion → CosyVoice instruction (GPU) */
const EMOTION_INSTRUCTION_MAP: Record<string, string> = {
  SWEET_ATTACHMENT: '用温柔甜蜜的语气说',
  QUIET_FOND: '用安静温柔的语气说',
  WARM_ENGAGEMENT: '用热情积极的语气说',
  CALM_RATIONAL: '用冷静平淡的语气说',
  COLD_RATIONAL: '用冷淡疏离的语气说',
  AGITATED: '用焦急不安的语气说',
  IRRITATED: '用不耐烦的语气说',
  VULNERABLE: '用脆弱委屈的语气说',
  NUMB_SHUTDOWN: '用麻木疲惫的语气说'
}

/** Personality modifier → CosyVoice instruction prefix */
const PERSONALITY_INSTRUCTION_MAP: Record<string, string> = {
  tsundere: '傲娇',
  sharp_tongued: '毒舌',
  gentle: '温柔',
  playful: '俏皮',
  cool: '高冷',
  enthusiastic: '热情'
}

/** Emotion → edge-tts rate/pitch adjustments (CPU fallback) */
type EdgeTtsParams = { rate: string; pitch: string }

const EMOTION_EDGE_TTS_MAP: Record<string, EdgeTtsParams> = {
  SWEET_ATTACHMENT: { rate: '-10%', pitch: '+5Hz' },
  QUIET_FOND: { rate: '-10%', pitch: '+5Hz' },
  WARM_ENGAGEMENT: { rate: '+5%', pitch: '+10Hz' },
  CALM_RATIONAL: { rate: '+0%', pitch: '+0Hz' },
  COLD_RATIONAL: { rate: '-5%', pitch: '-5Hz' },
  AGITATED: { rate: '+10%', pitch: '+10Hz' },
  IRRITATED: { rate: '+10%', pitch: '+10Hz' },
  VULNERABLE: { rate: '-15%', pitch: '-10Hz' },
  NUMB_SHUTDOWN: { rate: '-20%', pitch: '-15Hz' }
}

/**
 * Get CosyVoice emotion instruction for a given emotion label and optional personality.
 *
 * @param emotionLabel - L2 emotion label (e.g. "SWEET_ATTACHMENT")
 * @param personality - Optional personality key (e.g. "tsundere")
 * @returns CosyVoice instruction string, e.g. "用傲娇又甜蜜的语气说"
 */
export function getEmotionInstruction(emotionLabel: string, personality?: string): string {
  const base = EMOTION_INSTRUCTION_MAP[emotionLabel] || '用平静的语气说'

  if (!personality) return base

  const modifier = PERSONALITY_INSTRUCTION_MAP[personality]
  if (!modifier) return base

  // Insert personality modifier: "用温柔甜蜜的语气说" → "用傲娇又甜蜜的语气说"
  // Replace "用" prefix with "用{modifier}又"
  return base.replace('用', `用${modifier}又`)
}

/**
 * Get edge-tts rate/pitch params for a given emotion label.
 *
 * @param emotionLabel - L2 emotion label
 * @returns { rate, pitch } for edge-tts
 */
export function getEdgeTtsParams(emotionLabel: string): EdgeTtsParams {
  return EMOTION_EDGE_TTS_MAP[emotionLabel] || { rate: '+0%', pitch: '+0Hz' }
}
