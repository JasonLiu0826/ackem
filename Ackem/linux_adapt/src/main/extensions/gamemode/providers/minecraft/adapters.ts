// [extensions/gamemode/providers/minecraft/adapters] — McGameEvent ↔ GameEvent 适配

import type { EngineSnapshot } from '../../../protocols'
import type { CompanionReaction, GameEvent } from '../../types'
import type { EngineStateForGaming, McGameEvent, ReactionResult } from './types'

let eventSeq = 0

export function estimateSeverity(eventType: string): number {
  const high = ['player_death', 'boss_defeated', 'wither_spawn', 'dragon_kill']
  const medium = ['diamond_found', 'creeper_explosion', 'player_join', 'player_leave']
  if (high.some(t => eventType.includes(t))) return 0.9
  if (medium.some(t => eventType.includes(t))) return 0.5
  return 0.2
}

export function estimateValence(eventType: string): GameEvent['valence'] {
  const positive = ['diamond_found', 'achievement', 'level_up', 'boss_defeated', 'dragon_kill']
  const negative = ['player_death', 'creeper_explosion', 'fall_damage', 'fire_death', 'void_death']
  if (positive.some(t => eventType.includes(t))) return 'positive'
  if (negative.some(t => eventType.includes(t))) return 'negative'
  return 'neutral'
}

export function mcEventToGameEvent(
  mc: McGameEvent,
  gameId = 'minecraft'
): GameEvent {
  const ts = mc.timestamp || new Date().toISOString()
  eventSeq += 1
  return {
    id: `mc-${mc.type}-${Date.now()}-${eventSeq}`,
    gameId,
    type: mc.type,
    severity: estimateSeverity(mc.type),
    valence: estimateValence(mc.type),
    raw: mc.raw,
    timestamp: ts,
    payload: (mc.payload ?? {}) as Record<string, unknown>,
    dedupKey: `mc-${mc.type}-${ts.slice(0, 16)}`
  }
}

export function snapshotToEngineStateForGaming(snapshot: EngineSnapshot): EngineStateForGaming {
  return {
    aff: snapshot.emotion.aff,
    sec: snapshot.emotion.sec,
    aro: snapshot.emotion.aro,
    trust: snapshot.relationship.trust,
    stage: snapshot.relationship.stage,
    personalityId: snapshot.personality.presetId
  }
}

export function reactionResultToCompanion(
  reaction: ReactionResult,
  event: GameEvent
): CompanionReaction {
  const aff =
    reaction.emotionGroup === 'AROUSED' ? 3
      : reaction.emotionGroup === 'NEGATIVE' ? -2
        : 1
  const sec = reaction.emotionGroup === 'NEGATIVE' ? -2 : 1
  const aro = reaction.emotionGroup === 'AROUSED' ? 4 : reaction.emotionGroup === 'NEGATIVE' ? 2 : 1

  return {
    eventId: event.id,
    mode: 'bubble',
    bubble: reaction.text,
    emotion: {
      delta: { aff, sec, aro, dom: 0 },
      labelPriority:
        reaction.emotionGroup === 'AROUSED'
          ? ['EXCITED', 'HAPPY']
          : reaction.emotionGroup === 'NEGATIVE'
            ? ['CONCERNED', 'ANXIOUS']
            : ['CALM', 'NEUTRAL']
    },
    shouldRemember: event.severity > 0.5,
    memorySummary: event.severity > 0.5
      ? `[minecraft] ${event.raw.slice(0, 120)}`
      : undefined,
    cooldownSeconds: 10
  }
}
