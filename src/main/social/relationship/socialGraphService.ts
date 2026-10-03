import { getEdge, upsertEdge } from '../../db/repos/socialGraphRepo'
import { stageForTrust, stageWeight, type RelationshipStage } from './stage'

export type GraphAction = 'like' | 'comment' | 'co_view'

export function applyGraphAction(
  dataRoot: string,
  a: string,
  b: string,
  action: GraphAction,
  sentiment = 0
) {
  const prior = getEdge(dataRoot, a, b) ?? {
    trust: 25,
    rifts: 0,
    momentum: 0,
    stage: 'STRANGER' as RelationshipStage,
  }
  const base = action === 'like' ? 0.4 : action === 'comment' ? 0.8 : 0.05
  const stage = (prior.stage as RelationshipStage) || 'STRANGER'
  const delta = base * stageWeight(stage)
  const trust = Math.max(0, Math.min(100, prior.trust + delta))
  const rifts = prior.rifts + (sentiment < -0.3 ? 1 : 0)
  const momentum = prior.momentum * 0.9 + delta
  const nextStage = stageForTrust(trust)
  upsertEdge(dataRoot, a, b, { trust, rifts, momentum, stage: nextStage })
  return { trust, rifts, momentum, stage: nextStage, delta }
}
