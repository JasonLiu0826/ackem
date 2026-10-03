import { getEdge } from '../../db/repos/socialGraphRepo'
import { listGroups } from '../../db/repos/groupsRepo'
import { listMembers, addMember } from '../../db/repos/groupMembersRepo'
import { createGroup } from '../../db/repos/groupsRepo'
import { addGroupMessage } from '../../db/repos/groupMessagesRepo'
import { SOCIAL, socialId } from '../types'
import { getRegisteredAgent } from '../agents/agentRegistry'

/**
 * Spontaneous group formation: INTIMATE + sharedEvents >= threshold,
 * and no shared undissolved group.
 */
export function tryFormGroup(
  dataRoot: string,
  agentA: string,
  agentB: string,
  sharedEvents: number
): string | null {
  if (agentA === agentB) return null
  const edge = getEdge(dataRoot, agentA, agentB)
  if (!edge) return null
  if (edge.trust < SOCIAL.GROUP_FORM_TRUST && edge.stage !== 'INTIMATE') return null
  if (edge.stage !== 'INTIMATE' && edge.trust < SOCIAL.GROUP_FORM_TRUST) return null
  if (sharedEvents < SOCIAL.GROUP_FORM_SHARED_EVENTS) return null

  const groups = listGroups(dataRoot)
  for (const g of groups) {
    const members = listMembers(dataRoot, g.id)
    const ids = new Set(
      members.filter((m) => m.member_kind === 'agent').map((m) => m.member_id)
    )
    if (ids.has(agentA) && ids.has(agentB)) return null
  }

  const a = getRegisteredAgent(dataRoot, agentA)
  const b = getRegisteredAgent(dataRoot, agentB)
  const ownerId = agentA // more interactive caller decides; default A
  const now = new Date().toISOString()
  const id = socialId('grp')
  const name = `${a?.name ?? agentA} & ${b?.name ?? agentB}`
  createGroup(dataRoot, {
    id,
    name,
    owner_kind: 'agent',
    owner_id: ownerId,
    created_at: now,
    dissolved_at: null,
  })
  for (const [mid, role] of [
    [agentA, ownerId === agentA ? 'owner' : 'member'],
    [agentB, ownerId === agentB ? 'owner' : 'member'],
  ] as const) {
    addMember(dataRoot, {
      group_id: id,
      member_kind: 'agent',
      member_id: mid,
      role,
      joined_at: now,
    })
  }
  addGroupMessage(dataRoot, {
    id: socialId('gsys'),
    group_id: id,
    sender_kind: 'system',
    sender_id: 'system',
    content: `${a?.name ?? agentA} 和 ${b?.name ?? agentB} 建了一个群`,
    created_at: now,
  })
  return id
}
