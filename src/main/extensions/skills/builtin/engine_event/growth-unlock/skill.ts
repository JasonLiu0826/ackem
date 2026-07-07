import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { GROWTH_UNLOCK_MANIFEST } from './manifest'
import {
  findNewTrustMilestone,
  milestoneMessage,
  recordTrustMilestone
} from './growthStorage'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

export async function maybeTriggerGrowthUnlockAfterTurn(input: {
  prevTrust: number
  nextTrust: number
  snapshot: EngineSnapshot
}): Promise<string | null> {
  const { getExtensionsCoordinator } = await import('../../../../runtime')
  const coordinator = getExtensionsCoordinator()
  if (!coordinator) return null

  const inst = coordinator.skills.get(GROWTH_UNLOCK_MANIFEST.id)
  if (!inst || inst.status !== 'active') return null

  const dataRoot = resolveDataRootForSkill()
  const milestone = findNewTrustMilestone(input.prevTrust, input.nextTrust, dataRoot)
  if (milestone == null) return null

  recordTrustMilestone(dataRoot, milestone)
  const output = milestoneMessage(milestone)

  await coordinator.executeSkill({
    invocationId: `growth-${Date.now()}`,
    skillId: GROWTH_UNLOCK_MANIFEST.id,
    trigger: 'engine_event',
    triggerDetail: `trust:${milestone}`,
    snapshot: input.snapshot,
    args: { milestone, prevTrust: input.prevTrust, nextTrust: input.nextTrust }
  })

  return output
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const milestone = Number(invocation.args?.milestone ?? 0)
  const output = milestone > 0 ? milestoneMessage(milestone) : ''

  return {
    ok: true,
    output,
    injectToContext: Boolean(output),
    events: milestone
      ? [
          {
            id: `evt-growth-${Date.now()}`,
            category: 'skill',
            sourceId: GROWTH_UNLOCK_MANIFEST.id,
            type: 'growth_unlock:milestone',
            payload: { milestone },
            injectToContext: true,
            contextInjection: output,
            timestamp: new Date().toISOString()
          }
        ]
      : [],
    durationMs: Date.now() - start
  }
}

export const growthUnlockSkill: SkillHandler = {
  manifest: GROWTH_UNLOCK_MANIFEST,
  execute
}
