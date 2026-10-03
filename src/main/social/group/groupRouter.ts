import { SOCIAL } from '../types'

/** Pick up to GROUP_MAX_REPLIES agents; slight jitter so the same pair is not always first. */
export function selectGroupResponders<T extends { id: string; se: number; resonance: number }>(
  agents: T[]
): T[] {
  if (agents.length <= SOCIAL.GROUP_MAX_REPLIES) return [...agents]
  const scored = agents.map((a) => ({
    a,
    score: a.se * a.resonance * (0.85 + Math.random() * 0.3),
  }))
  scored.sort((x, y) => y.score - x.score)
  return scored.slice(0, SOCIAL.GROUP_MAX_REPLIES).map((x) => x.a)
}
