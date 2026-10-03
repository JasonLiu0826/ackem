import { createGroup, dissolveGroup, getGroup, listGroups, type GroupRow } from '../../db/repos/groupsRepo'
import { addMember, listMembers, removeMember } from '../../db/repos/groupMembersRepo'
import { addGroupMessage, listGroupMessages } from '../../db/repos/groupMessagesRepo'
import { getDatabase } from '../../db/database'
import { socialId } from '../types'
import { selectGroupResponders } from './groupRouter'
import { groupReply, suggestGroupName } from './groupReply'
import { listRegisteredAgents } from '../agents/agentRegistry'

export function createUserGroup(
  dataRoot: string,
  name: string,
  agentIds: string[]
): GroupRow {
  const agents = listRegisteredAgents(dataRoot)
  const uniqueIds = [...new Set(agentIds.filter(Boolean))]
  const memberNames = uniqueIds
    .map((id) => agents.find((a) => a.id === id)?.name)
    .filter((n): n is string => Boolean(n))
  const trimmed = name.trim()
  const finalName =
    trimmed.length > 0 && trimmed !== '小聚'
      ? trimmed.slice(0, 32)
      : suggestGroupName(memberNames)

  const now = new Date().toISOString()
  const group: GroupRow = {
    id: socialId('grp'),
    name: finalName,
    owner_kind: 'user',
    owner_id: 'local',
    created_at: now,
    dissolved_at: null,
  }
  createGroup(dataRoot, group)
  addMember(dataRoot, {
    group_id: group.id,
    member_kind: 'user',
    member_id: 'local',
    role: 'owner',
    joined_at: now,
  })
  for (const id of uniqueIds) {
    addMember(dataRoot, {
      group_id: group.id,
      member_kind: 'agent',
      member_id: id,
      role: 'member',
      joined_at: now,
    })
  }
  const who =
    memberNames.length > 0 ? memberNames.join('、') : '大家'
  addGroupMessage(dataRoot, {
    id: socialId('gmsg'),
    group_id: group.id,
    sender_kind: 'system',
    sender_id: 'system',
    content: `${who}进了「${finalName}」。随便聊聊就好。`,
    created_at: now,
  })
  return group
}

export function leaveGroup(dataRoot: string, groupId: string, kind: 'user' | 'agent', id: string): void {
  removeMember(dataRoot, groupId, kind, id)
  const members = listMembers(dataRoot, groupId)
  const agents = members.filter((m) => m.member_kind === 'agent')
  if (agents.length <= 1) {
    dissolveGroup(dataRoot, groupId)
  }
}

export function sendGroupMessage(
  dataRoot: string,
  groupId: string,
  content: string,
  senderKind: 'user' | 'agent' = 'user',
  senderId = 'local'
): { messageId: string; replies: string[] } {
  const now = new Date().toISOString()
  const messageId = socialId('gmsg')
  addGroupMessage(dataRoot, {
    id: messageId,
    group_id: groupId,
    sender_kind: senderKind,
    sender_id: senderId,
    content,
    created_at: now,
  })

  const replies: string[] = []
  if (senderKind === 'user') {
    const members = listMembers(dataRoot, groupId).filter((m) => m.member_kind === 'agent')
    const agents = listRegisteredAgents(dataRoot)
    const candidates = members
      .map((m) => {
        const a = agents.find((x) => x.id === m.member_id)
        if (!a) return null
        return {
          id: a.id,
          name: a.name,
          se: a.se,
          sp: a.sp,
          so: a.so,
          presetId: a.preset_id,
          resonance: Math.max(0.15, a.so / 100),
        }
      })
      .filter(
        (
          x
        ): x is {
          id: string
          name: string
          se: number
          sp: number
          so: number
          presetId: string
          resonance: number
        } => !!x
      )

    const used = new Set<string>()
    let delayMs = 0
    for (const r of selectGroupResponders(candidates)) {
      delayMs += 400 + Math.floor(Math.random() * 600)
      const text = groupReply({
        name: r.name,
        presetId: r.presetId,
        se: r.se,
        sp: r.sp,
        so: r.so,
        userText: content,
        used,
      })
      addGroupMessage(dataRoot, {
        id: socialId('greply'),
        group_id: groupId,
        sender_kind: 'agent',
        sender_id: r.id,
        content: text,
        created_at: new Date(Date.now() + delayMs).toISOString(),
      })
      replies.push(r.id)
    }
  }
  return { messageId, replies }
}

export { listGroups, getGroup, listGroupMessages, listMembers, dissolveGroup }

export function requestJoinGroup(dataRoot: string, groupId: string, userId = 'local'): string {
  const db = getDatabase(dataRoot)
  if (!db) throw new Error('DATABASE_UNAVAILABLE')
  const id = socialId('join')
  db.prepare(
    `INSERT INTO group_join_requests(id, group_id, user_id, status, requested_at, responded_at)
     VALUES(?, ?, ?, 'pending', ?, NULL)`
  ).run(id, groupId, userId, new Date().toISOString())
  return id
}
