import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { DREAM_GENERATOR_MANIFEST } from './manifest'
import { buildDreamStory } from './dreamText'

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const facts = invocation.snapshot.memory.recentFactSummaries ?? []
  const mood = typeof invocation.args?.mood === 'string' ? invocation.args.mood : undefined
  const output = buildDreamStory({
    facts,
    emotionLabel: invocation.snapshot.emotion.primaryLabel,
    mood
  })

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [],
    durationMs: Date.now() - start
  }
}

export const dreamGeneratorSkill: SkillHandler = {
  manifest: DREAM_GENERATOR_MANIFEST,
  execute
}
