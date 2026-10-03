export type AchievementDef = {
  id: string
  tier: 'copper' | 'silver' | 'gold'
  title: string
  reveal: string
  kind: 'event' | 'progress' | 'composite'
  eventType?: string
  progressKey?: string
  threshold?: number
}

const COPPER = [
  'first_visit',
  'first_chat_other',
  'first_friend',
  'first_like',
  'first_comment',
  'social_butterfly',
  'all_friends',
  'first_resonance',
  'got_liked',
  'got_commented',
  'post_ignored',
  'post_popular',
  'half_friends',
  'first_group_join',
  'first_group_msg',
  'mute_one',
  'offline_return_6h',
  'remembered',
  'forgotten',
  'daily_regular',
] as const

const SILVER = [
  'close_friend',
  'soulmate',
  'all_trusted',
  'ice_melted',
  'peacemaker',
  'mood_swing',
  'jealousy_seen',
  'group_formed',
  'jealousy_triggered',
] as const

const GOLD = ['jealousy_king', 'reunion_30d', 'social_legend'] as const

function def(
  id: string,
  tier: AchievementDef['tier'],
  eventType?: string
): AchievementDef {
  return {
    id,
    tier,
    title: id.split('_').join(' '),
    reveal: `解锁：${id}`,
    kind: 'event',
    eventType: eventType ?? id,
  }
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  ...COPPER.map((id) => def(id, 'copper')),
  ...SILVER.map((id) => def(id, 'silver')),
  ...GOLD.map((id) => def(id, 'gold')),
]

if (ACHIEVEMENT_DEFS.length < 30) {
  throw new Error('ACHIEVEMENT_DEFS must contain at least 30 definitions')
}
