import type { AckemCodeSettings, AgentTier, ToolDefinition } from '../../shared/types.js'
import { clampPlanExploreAgents } from './tasks.js'

/** team tier raises Plan parallel Explore floor (CC multi-view spirit; not Swarm). */
export const TEAM_PLAN_EXPLORE_FLOOR = 4

export const AGENT_COLLAB_TOOL_NAMES = new Set([
  'agent',
  'agent_stop',
  'agent_output'
])

export const SLASH_AGENT_TIERS: AgentTier[] = ['solo', 'auto', 'team']

export function normalizeAgentTier(v: unknown): AgentTier {
  if (v === 'solo' || v === 'auto' || v === 'team') return v
  return 'auto'
}

export function agentToolsEnabled(tier: AgentTier): boolean {
  return tier !== 'solo'
}

/**
 * Effective PlanV2 parallel Explore count from tier + settings.planExploreAgents.
 * solo → 1; auto → clamped setting; team → max(setting, TEAM_PLAN_EXPLORE_FLOOR).
 */
export function effectivePlanExploreAgents(
  settings: Pick<AckemCodeSettings, 'agentTier' | 'planExploreAgents'>
): number {
  const tier = normalizeAgentTier(settings.agentTier)
  const base = clampPlanExploreAgents(settings.planExploreAgents ?? 2)
  if (tier === 'solo') return 1
  if (tier === 'team') return Math.max(base, TEAM_PLAN_EXPLORE_FLOOR)
  return base
}

/** Hide agent / background-agent tools when solo tier. */
export function filterToolsForAgentTier(
  defs: ToolDefinition[],
  tier: AgentTier
): ToolDefinition[] {
  if (agentToolsEnabled(tier)) return defs
  return defs.filter((d) => !AGENT_COLLAB_TOOL_NAMES.has(d.function.name))
}

export function agentTierLabel(tier: AgentTier): string {
  switch (tier) {
    case 'solo':
      return '┃ solo'
    case 'team':
      return '┃ ┃ ┃ team'
    default:
      return '┃ ┃ auto'
  }
}
