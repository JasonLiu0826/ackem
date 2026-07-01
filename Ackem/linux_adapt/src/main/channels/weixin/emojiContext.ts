import type { WeixinDeliveryProfile } from './deliveryProfiles'

export type EmojiMood =
  | 'playful'
  | 'tease'
  | 'warm'
  | 'shy'
  | 'annoyed'
  | 'cold'
  | 'hype'
  | 'sad'
  | 'love'

const MOOD_EMOJI: Record<EmojiMood, string[]> = {
  playful: ['😏', '😜', '🙃', '😝'],
  tease: ['😤', '🙄', '哼'],
  warm: ['🥰', '😊', '☺️', '🤗'],
  shy: ['👉👈', '😳', '🫣'],
  hype: ['✨', '🎮', '🔥', '💪'],
  annoyed: ['😒', '😑', '💢'],
  cold: ['…', '😐'],
  sad: ['🥺', '😔'],
  love: ['❤️', '💕', '😘']
}

const PRESET_MOOD_BIAS: Record<string, EmojiMood[]> = {
  tsundere: ['tease', 'annoyed', 'shy'],
  genki: ['hype', 'playful', 'warm'],
  mesugaki: ['tease', 'playful', 'hype'],
  kuudere: ['cold'],
  iceberg: ['cold'],
  ice_queen: ['cold'],
  deredere: ['warm', 'love'],
  mommy: ['warm', 'love'],
  daddy: ['warm'],
  yandere: ['love', 'playful'],
  puppy: ['warm', 'hype', 'love'],
  loyal_pup: ['warm', 'love'],
  bokke: ['playful', 'shy'],
  innocent_boy: ['playful', 'shy']
}

const USER_MOOD_HINTS: Array<{ re: RegExp; mood: EmojiMood }> = [
  { re: /游戏|打|皇室|王者|原神|mc|minecraft/i, mood: 'hype' },
  { re: /吗\?|么\?|？$/u, mood: 'playful' },
  { re: /哈哈|hhh|笑|搞笑/i, mood: 'playful' },
  { re: /想你了|喜欢|爱|抱抱|亲亲/i, mood: 'love' },
  { re: /难过|伤心|累|烦|郁闷/i, mood: 'sad' },
  { re: /在吗|在不|睡了吗/i, mood: 'warm' },
  { re: /哼|讨厌|烦死了/i, mood: 'tease' }
]

export function inferEmojiMood(userText: string, aro: number, aff: number): EmojiMood {
  for (const { re, mood } of USER_MOOD_HINTS) {
    if (re.test(userText)) return mood
  }
  if (aro > 15 && aff > 10) return 'hype'
  if (aro < -8) return 'sad'
  if (aff > 12) return 'warm'
  if (aro > 5) return 'playful'
  return 'warm'
}

function pickFromPool(pool: string[], rng: () => number): string {
  return pool[Math.floor(rng() * pool.length)] ?? '😊'
}

export function pickContextEmoji(args: {
  presetId: string
  userText: string
  bubbleText: string
  aro: number
  aff: number
  profile: WeixinDeliveryProfile
  rng?: () => number
}): string | null {
  const rng = args.rng ?? Math.random
  if (rng() > args.profile.emojiDensity) return null

  const mood = inferEmojiMood(args.userText, args.aro, args.aff)
  const biased = PRESET_MOOD_BIAS[args.presetId]
  const moods = biased?.length ? biased : [mood]
  const chosenMood = moods[Math.floor(rng() * moods.length)] ?? mood
  const pool = MOOD_EMOJI[chosenMood]
  const emoji = pickFromPool(pool, rng)

  if (emoji === '哼' || emoji === '…') {
    return args.bubbleText.includes(emoji) ? null : emoji
  }
  if (args.bubbleText.includes(emoji)) return null
  return emoji
}

/** 是否在本轮追加「单独 emoji 气泡」 */
export function planStandaloneEmojiBurst(args: {
  profile: WeixinDeliveryProfile
  userText: string
  aro: number
  aff: number
  bubbleCount: number
  rng?: () => number
}): { emoji: string; repeat: 1 | 3 } | null {
  const rng = args.rng ?? Math.random
  if (rng() > args.profile.standaloneEmojiChance) return null

  const mood = inferEmojiMood(args.userText, args.aro, args.aff)
  const pool = MOOD_EMOJI[mood]
  const emoji = pickFromPool(pool, rng)
  if (emoji === '哼' || emoji === '…') return { emoji, repeat: 1 }

  const repeat =
    rng() < args.profile.tripleEmojiChance && args.profile.emojiDensity > 0.4 ? 3 : 1
  return { emoji, repeat }
}

/** 句内插入 emoji（末尾或语气词后） */
export function insertInlineEmoji(text: string, emoji: string): string {
  if (!emoji || text.includes(emoji)) return text
  if (emoji === '哼') {
    if (/哼[。！？]?$/.test(text)) return text
    return `${text.replace(/[。！？]?$/, '')}，哼`
  }
  if (/[。！？…]$/.test(text)) return `${text}${emoji}`
  return `${text}${emoji}`
}
