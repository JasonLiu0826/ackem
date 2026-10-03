/** When episodic memory may be created (evidence-backed; not turn-count alone). */
export type EpisodeTriggerContext = {
  exchangeCount: number
  emotionIntensity: number
  evidenceEventIds: string[]
  userMarkedImportant?: boolean
  terminalWorkSucceeded?: boolean
}

export function shouldProposeEpisode(ctx: EpisodeTriggerContext): boolean {
  if (ctx.evidenceEventIds.length === 0) return false
  if (ctx.userMarkedImportant || ctx.terminalWorkSucceeded) {
    return ctx.exchangeCount >= 1
  }
  if (ctx.exchangeCount < 3) return false
  return ctx.emotionIntensity >= 0.72
}

/** User utterance marks the turn as worth episodic recall. */
export function userMarkedEpisodeImportant(userMsg: string): boolean {
  const t = userMsg.trim()
  if (!t) return false
  return /很重要|别忘了|记得今天|里程碑|第一次|永远记住|意义重大/.test(t)
}
