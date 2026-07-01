import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { FUN_PROFILE_MANIFEST } from './manifest'
import { buildFunProfile } from './funProfileText'

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const facts = invocation.snapshot.memory.recentFactSummaries ?? []
  const trust = invocation.snapshot.relationship.trust
  const tone =
    typeof invocation.args?.tone === 'string' ? invocation.args.tone.trim() : undefined
  const output = buildFunProfile(facts, trust, tone)

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [],
    data: { factCount: facts.length, trust },
    durationMs: Date.now() - start
  }
}

export const funProfileSkill: SkillHandler = {
  manifest: FUN_PROFILE_MANIFEST,
  execute
}
