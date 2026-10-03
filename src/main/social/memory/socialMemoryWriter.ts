import type { EmotionalContext } from '../../engine/types'
import { FactStore, defaultFactsPath } from '../../memory/factStore'
import type { FactProvenance, InteractionSurface, CounterpartyKind } from '../../memory/provenance'
import { validateProvenance } from '../../memory/provenance'
import { PRIMARY_AGENT_ID, sessionIdForAgent } from '../agents/agentPaths'
import { runWithAgentContextSync } from '../agents/withAgentContext'

export type SocialMemoryWriteInput = {
  ownerAgentId: string
  surface: InteractionSurface
  counterpartyKind: CounterpartyKind
  counterpartyId?: string | null
  involvesUser: boolean
  text: string
  context?: Record<string, unknown>
  /** Human-readable summary for recall; defaults from text/context. */
  summary?: string
  subject?: string
}

const NEUTRAL_EMO: EmotionalContext = {
  valence: 0,
  intensity: 0.35,
  relStage: 'FAMILIAR',
  trust: 40,
  atmosphere: 'neutral',
}

/** Build provenance for a social memory write (validates fields). */
export function buildSocialProvenance(input: SocialMemoryWriteInput): FactProvenance {
  const p: FactProvenance = {
    ownerAgentId: input.ownerAgentId,
    interactionSurface: input.surface,
    counterpartyKind: input.counterpartyKind,
    counterpartyId: input.counterpartyId ?? null,
    involvesUser: input.involvesUser,
    occurredAt: new Date().toISOString(),
    contextJson: input.context,
  }
  validateProvenance(input.ownerAgentId, p)
  return p
}

function resolveSummary(input: SocialMemoryWriteInput): { subject: string; summary: string } {
  if (input.subject && input.summary) {
    return { subject: input.subject, summary: input.summary }
  }
  const kind = String(input.context?.kind ?? input.text)
  switch (kind) {
    case 'like':
    case 'user_like_post':
      return { subject: '用户互动', summary: '用户给你的朋友圈点了赞' }
    case 'comment':
    case 'user_comment_post':
      return { subject: '用户互动', summary: '用户评论了你的朋友圈' }
    case 'member_posted':
      return { subject: '发帖', summary: '我发了一条朋友圈动态' }
    case 'agent_interacted':
      return { subject: '朋友圈互动', summary: '我和其他成员的动态发生了互动' }
    case 'group_message':
      return { subject: '群聊', summary: '我在群里参与了对话' }
    case 'jealous_memory':
      return {
        subject: '在意',
        summary: input.summary ?? '我有点在意用户最近更亲近别人',
      }
    default:
      return {
        subject: input.subject ?? '社会见闻',
        summary: input.summary ?? input.text.slice(0, 200),
      }
  }
}

/**
 * Selective social memory write: provenance + FactStore landing.
 * Never throws to callers — store failures are best-effort.
 */
export function writeSocialFact(dataRoot: string, input: SocialMemoryWriteInput): FactProvenance {
  const provenance = buildSocialProvenance(input)
  const { subject, summary } = resolveSummary(input)

  try {
    const store = new FactStore(defaultFactsPath(dataRoot))
    store.load()
    // Primary echo / durable social: empty session → cross-session recall (W6 DEBT-1)
    const sourceSessionId =
      input.ownerAgentId === PRIMARY_AGENT_ID &&
      (input.surface === 'social_tick' || input.involvesUser)
        ? ''
        : sessionIdForAgent(input.ownerAgentId)

    runWithAgentContextSync(
      input.ownerAgentId,
      () => {
        store.addFactDetailed({
          domain: 'SOCIAL',
          subcategory: input.involvesUser ? 'OUR_BOND' : 'FRIENDS',
          subject,
          summary,
          weight: input.involvesUser ? 2.2 : 1.2,
          confidence: 0.8,
          selfRelevance: input.involvesUser ? 0.95 : 0.8,
          triggers: [subject, summary.slice(0, 24), String(input.context?.postId ?? '')].filter(
            Boolean
          ),
          sourceSessionId,
          sourceTurnIndex: 0,
          emotionalContext: NEUTRAL_EMO,
          ownerAgentId: input.ownerAgentId,
          interactionSurface: input.surface,
          counterpartyKind: input.counterpartyKind,
          counterpartyId: input.counterpartyId ?? null,
          involvesUser: input.involvesUser,
          occurredAt: provenance.occurredAt,
          contextJson: input.context,
          factLayer: input.involvesUser ? 'consolidated' : 'raw',
        })
        // JSON-buffer mode otherwise loses writes before next process load
        store.flush()
      },
      { interactionSurface: input.surface }
    )
  } catch {
    /* FactStore may be unavailable in early boot / tests without layout */
  }

  return provenance
}

export function writeUserFeedInteractionFact(
  dataRoot: string,
  memberAgentId: string,
  kind: 'like' | 'comment',
  postId: string
): FactProvenance {
  return writeSocialFact(dataRoot, {
    ownerAgentId: memberAgentId,
    surface: 'social_feed',
    counterpartyKind: 'user',
    counterpartyId: null,
    involvesUser: true,
    text: `user_${kind}_post`,
    context: { postId, kind },
  })
}

export function writeMemberPostFact(
  dataRoot: string,
  memberAgentId: string,
  postId: string
): FactProvenance {
  return writeSocialFact(dataRoot, {
    ownerAgentId: memberAgentId,
    surface: 'social_feed',
    counterpartyKind: 'none',
    counterpartyId: null,
    involvesUser: false,
    text: 'member_posted',
    context: { postId },
  })
}

export function writeAgentInteractFact(
  dataRoot: string,
  actorId: string,
  authorId: string,
  postId: string
): FactProvenance {
  return writeSocialFact(dataRoot, {
    ownerAgentId: actorId,
    surface: 'social_feed',
    counterpartyKind: 'agent',
    counterpartyId: authorId,
    involvesUser: false,
    text: 'agent_interacted',
    context: { postId },
  })
}

export function writeSocialEchoFact(
  dataRoot: string,
  sourceAgentId: string,
  text: string
): FactProvenance {
  return writeSocialFact(dataRoot, {
    ownerAgentId: PRIMARY_AGENT_ID,
    surface: 'social_tick',
    counterpartyKind: 'agent',
    counterpartyId: sourceAgentId,
    involvesUser: false,
    text,
    summary: text,
    subject: '日常见闻',
  })
}

export function writeGroupMessageFact(
  dataRoot: string,
  memberAgentId: string,
  groupId: string,
  involvesUser: boolean
): FactProvenance {
  return writeSocialFact(dataRoot, {
    ownerAgentId: memberAgentId,
    surface: 'social_group',
    counterpartyKind: 'group',
    counterpartyId: groupId,
    involvesUser,
    text: 'group_message',
    context: { groupId },
  })
}

export function writeJealousyMemoryFact(
  dataRoot: string,
  agentId: string,
  favoriteId: string,
  favoriteName: string
): FactProvenance {
  return writeSocialFact(dataRoot, {
    ownerAgentId: agentId,
    surface: 'social_tick',
    counterpartyKind: 'agent',
    counterpartyId: favoriteId,
    involvesUser: true,
    text: 'jealous_memory',
    summary: `我有点在意用户最近更亲近${favoriteName}`,
    subject: '在意',
    context: { favoriteId, kind: 'jealous_memory' },
  })
}
