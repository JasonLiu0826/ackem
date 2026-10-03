import { getSocialSettings } from '../settings'
import { stepRecord } from './steps/stepRecord'
import { stepPost } from './steps/stepPost'
import { stepBroadcast } from './steps/stepBroadcast'
import { stepFeedback } from './steps/stepFeedback'
import { stepRelations } from './steps/stepRelations'
import { stepAchievements } from './steps/stepAchievements'
import { setSocialMeta } from '../../db/repos/socialMetaRepo'

export type SocialTickResult = {
  skipped?: boolean
  recorded: number
  posts: number
  interactions: number
  feedbackUpdated: number
  graphUpdates: number
  jealousy: number
  unlocked: string[]
}

let tickCounter = 0

/** Run one full social tick for dataRoot. Safe no-op when social.enabled=false. */
export async function runSocialTick(dataRoot: string): Promise<SocialTickResult> {
  const settings = getSocialSettings(dataRoot)
  if (!settings.enabled) {
    return {
      skipped: true,
      recorded: 0,
      posts: 0,
      interactions: 0,
      feedbackUpdated: 0,
      graphUpdates: 0,
      jealousy: 0,
      unlocked: [],
    }
  }

  const recorded = stepRecord(dataRoot)
  const posts = await stepPost(dataRoot)
  const broadcast = stepBroadcast(dataRoot)
  const feedback = stepFeedback(dataRoot)
  const relations = stepRelations(dataRoot)
  tickCounter++
  const achieve = stepAchievements(dataRoot, tickCounter)

  try {
    setSocialMeta(dataRoot, 'last_social_active_at', new Date().toISOString())
  } catch {
    /* meta table may be missing until V12 wired */
  }

  return {
    recorded: recorded.recorded,
    posts: posts.posts,
    interactions: broadcast.interactions,
    feedbackUpdated: feedback.updated,
    graphUpdates: relations.graphUpdates,
    jealousy: relations.jealousy,
    unlocked: achieve.unlocked,
  }
}
