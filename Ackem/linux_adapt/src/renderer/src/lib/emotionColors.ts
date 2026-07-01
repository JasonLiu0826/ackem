/** 情绪标签 → 光丝 / 星图色（暖烬·光核 v6） */
export const EMOTION_LABEL_ZH: Record<string, string> = {
  SWEET_ATTACHMENT: '甜蜜依恋',
  SHY_HEARTBEAT: '害羞心动',
  TSUNDERE: '傲娇',
  HURT_GRIEVANCE: '委屈受伤',
  ANGRY_ATTACK: '愤怒反击',
  COLD_DETACHED: '冷淡疏离',
  FEARFUL_OBEDIENT: '不安顺从',
  QUIET_FOND: '安静的喜欢',
  CALM_RATIONAL: '平静理性'
}

export function emotionLightColor(label: string): string {
  switch (label) {
    case 'SWEET_ATTACHMENT':
    case 'SHY_HEARTBEAT':
    case 'QUIET_FOND':
      return 'var(--color-emotion-sweet)'
    case 'TSUNDERE':
    case 'HURT_GRIEVANCE':
      return 'var(--color-emotion-warm)'
    case 'COLD_DETACHED':
    case 'ANGRY_ATTACK':
      return 'var(--color-emotion-cold)'
    case 'FEARFUL_OBEDIENT':
      return 'var(--color-emotion-fear)'
    default:
      return 'var(--color-accent)'
  }
}
