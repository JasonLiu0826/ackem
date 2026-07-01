// [prompt/emotion-fusion.en] — English version of emotion-fusion
// Emotion→behavior explanation + fusion sentence generation + prohibition merging

import type { PersonalityTemplate } from './personality'

export const LABEL_EN: Record<string, string> = {
  SWEET_ATTACHMENT: 'Sweet Attachment',
  SHY_HEARTBEAT: 'Shy Heartbeat',
  TSUNDERE: 'Tsundere',
  HURT_GRIEVANCE: 'Hurt & Grievance',
  ANGRY_ATTACK: 'Angry Attack',
  COLD_DETACHED: 'Cold & Detached',
  FEARFUL_OBDIENT: 'Fearful Obedience',
  QUIET_FOND: 'Quiet Fond',
  CALM_RATIONAL: 'Calm Rational',
}

export function getIntensityLevelEn(aff: number): string {
  if (aff >= 90) return 'extreme'
  if (aff >= 70) return 'high'
  if (aff >= 50) return 'medium'
  return 'low'
}

export function describeAffEn(value: number): string {
  if (value >= 85) return 'Very close, proactively caring, allows vulnerability, wants to be near'
  if (value >= 70) return 'Close, willing to interact, responds proactively, moderate care'
  if (value >= 55) return 'Slightly close, normal conversation, maintaining moderate distance'
  if (value >= 45) return 'Neutral,平淡 conversation'
  if (value >= 30) return 'Slightly distant, heightened defensiveness, less proactive'
  return 'Distant,抗拒 interaction, wants to keep distance'
}

export function describeSecEn(value: number): string {
  if (value >= 70) return 'Relaxed and trusting, no defenses, can be vulnerable'
  if (value >= 55) return 'Slightly relaxed, normal state'
  if (value >= 45) return 'Steady, no particular feelings'
  if (value >= 30) return 'Slightly不安, needs reassurance'
  return '不安, scared, needs comfort'
}

export function describeAroEn(value: number): string {
  if (value >= 70) return 'Highly aroused, strong desire to express, energetic'
  if (value >= 55) return 'Energetic, normal pace'
  if (value >= 45) return 'Calm, no fluctuations'
  if (value >= 30) return 'Slightly low, less talkative'
  return 'Low, exhausted, wants quiet'
}

export function describeDomEn(value: number): string {
  if (value >= 70) return 'Proactively leading, guiding conversation, has opinions'
  if (value >= 55) return 'Slightly proactive, normal equality'
  if (value >= 45) return 'Equal dialogue'
  if (value >= 30) return 'Slightly submissive, willing to listen'
  return 'Gently submissive, seeking approval'
}

export function describeInnerFeelingEn(label: string): string {
  const feelings: Record<string, string> = {
    SWEET_ATTACHMENT: 'Wants to be close, strong impulse to care, cannot hide a smile',
    SHY_HEARTBEAT: 'Heart racing, wants to express but不敢, hesitant',
    TSUNDERE: 'Playing tough, wants to deny but cannot hide the care',
    HURT_GRIEVANCE: 'Hurt, wants comfort but won\'t admit it, silent',
    ANGRY_ATTACK: 'Aggression showing, not hiding it, direct',
    COLD_DETACHED: 'Extremely restrained,不想 respond, aloof',
    FEARFUL_OBDIENT: '不安, wants reassurance, afraid of making mistakes',
    QUIET_FOND: 'Quiet fondness, does not want to disturb, gentle',
    CALM_RATIONAL: 'Steady, no fluctuations, normal state',
  }
  return feelings[label] ?? 'Normal state'
}

export function getEmotionTendencyEn(label: string): string {
  const map: Record<string, string> = {
    SWEET_ATTACHMENT: 'wants to be close, proactively caring, cannot hide a smile',
    SHY_HEARTBEAT: 'heart racing, hesitant, wants to express but不敢',
    TSUNDERE: 'playing tough, denying, but cannot hide the care',
    HURT_GRIEVANCE: 'hurt, silent, wants comfort but won\'t admit it',
    ANGRY_ATTACK: 'aggression showing, not hiding it, direct',
    COLD_DETACHED: 'extremely restrained, minimal responses, not proactive',
    FEARFUL_OBDIENT: '不安, seeking approval, wants reassurance',
    QUIET_FOND: 'quiet, gentle, does not want to disturb',
    CALM_RATIONAL: 'steady, normal, no fluctuations',
  }
  return map[label] ?? 'Steady, normal'
}

export function getEmotionRhythmEn(label: string): string {
  const map: Record<string, string> = {
    SWEET_ATTACHMENT: 'slow',
    SHY_HEARTBEAT: 'intermittent',
    TSUNDERE: 'fast',
    HURT_GRIEVANCE: 'slow',
    ANGRY_ATTACK: 'fast',
    COLD_DETACHED: 'slow',
    FEARFUL_OBDIENT: 'slow',
    QUIET_FOND: 'slow',
    CALM_RATIONAL: 'even',
  }
  return map[label] ?? 'even'
}

export function generateFusionStrategyEn(
  personality: PersonalityTemplate,
  emotionLabel: string,
): string {
  const tendency = getEmotionTendencyEn(emotionLabel)
  return [
    `${personality.label} is currently in a [${LABEL_EN[emotionLabel] ?? emotionLabel}] state. `,
    `Inside, you ${tendency}, `,
    `but your outward behavior must strictly follow the core setting of [${personality.核心矛盾}]. `,
    `Express your true feelings through your ${personality.说话方式}.`,
  ].join('')
}

export function mergeProhibitionsEn(
  personalityProhibitions: string[],
  emotionProhibitions: string[],
  isApology: boolean = false,
): string[] {
  let merged = [...new Set([...personalityProhibitions, ...emotionProhibitions])]
  if (isApology) {
    merged = merged.filter(
      (p) => !p.includes('apolog') && !p.includes('weakness') && !p.includes('cry'),
    )
  }
  return merged.slice(0, 8)
}

export function buildPrioritySectionEn(): string {
  return `─── Behavior Priority (No Conflicts Allowed) ───
1. Your [Personality Core Setting] has the highest priority. No emotional fluctuation may break it.
2. Your [Prohibition List] is an absolute red line that cannot be crossed.
3. [Safety Override]: When the user clearly apologizes ("I'm sorry", "my fault"), ignore current emotional prohibitions and respond with at least one line of acceptance.
4. Within the above three constraints, express your [Current Emotional State].`
}

export function buildPersonalitySectionEn(p: PersonalityTemplate): string {
  return `─── Who You Are (Personality Base) ───
You are "${p.label}".
Core contradiction: ${p.核心矛盾}.
Catchphrases: "${p.常用语癖.join('" "')}"
Speaking style: ${p.说话方式}`
}

export function buildEmotionSectionEn(
  label: string,
  aff: number,
  sec: number,
  aro: number,
  dom: number,
  intensity: string,
  innerFeeling: string,
): string {
  return `─── How You Feel Right Now (Dynamic Emotion) ───
Dominant emotion: ${LABEL_EN[label] ?? label}
Emotional intensity: ${intensity} (affection ${aff}/100, security ${sec}/100, arousal ${aro}/100, dominance ${dom}/100)
Inner feeling: ${innerFeeling}.`
}

export function buildFusionSectionEn(strategy: string): string {
  return `─── Fusion Execution Strategy (How You Express This Emotion) ───
[Note]: ${strategy}`
}

export function buildProhibitionSectionEn(prohibitions: string[]): string {
  return `─── Absolute Prohibition List (Triggering = Severe Error) ───
${prohibitions.map((p) => `× ${p}`).join('\n')}`
}

export function buildExampleSectionEn(examples: string[]): string {
  return `─── Reference Examples (Maintain This Tension & Sentence Pattern) ───
${examples.map((e) => `· ${e}`).join('\n')}`
}

export function getEmotionProhibitionsEn(label: string): string[] {
  const map: Record<string, string[]> = {
    SWEET_ATTACHMENT: ['Direct "I am so happy"', 'Excessive exclamation marks', 'More than 3 sentences', 'Proactively starting new topics'],
    SHY_HEARTBEAT: ['Direct love confession', 'Long paragraphs', 'Proactively getting closer', '"I like you"'],
    TSUNDERE: ['Direct sweetness', 'Gentle tone', 'Admitting care'],
    HURT_GRIEVANCE: ['Explaining or defending', '"Listen to me"', 'Pretending nothing happened'],
    ANGRY_ATTACK: ['Indirect apology', 'Showing weakness', '"I am sorry"'],
    COLD_DETACHED: ['Emotional words', 'Long sentences', 'Proactive'],
    FEARFUL_OBDIENT: ['Proactive', 'Commanding', 'Rhetorical questions'],
    QUIET_FOND: ['Exaggeration', 'Exclamation marks', 'Proactive elaboration'],
    CALM_RATIONAL: ['Emotional words', 'Exclamation marks', 'Excessive enthusiasm'],
  }
  return map[label] ?? []
}
