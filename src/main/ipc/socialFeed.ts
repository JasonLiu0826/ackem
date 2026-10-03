/**
 * socialFeed IPC — 朋友圈 / 好友 / 屏蔽 / 群 / 成就 / 设置 / Tick
 */

import { ipcMain } from 'electron'
import { listInteractions, addInteraction, hasLiked } from '../db/repos/fcInteractionsRepo'
import { getPost, listPosts } from '../db/repos/friendCircleRepo'
import { listFriendships, getFriendship } from '../db/repos/userFriendshipsRepo'
import { listSocialEvents } from '../db/repos/socialEventsRepo'
import { getSocialMeta, setSocialMeta } from '../db/repos/socialMetaRepo'
import { unlockAchievement, listAchievements } from '../db/repos/achievementsRepo'
import { loadCompanionStateFromDb } from '../db/repos/companionState'
import { socialId } from '../social/types'
import { getFeed } from '../social/feed/friendCircleService'
import { seedPosts } from '../social/feed/seedPosts'
import { decideFriendship } from '../social/relationship/userFriendshipService'
import {
  muteAgent,
  blockAgent,
  unblockAgent,
  listBlocks,
} from '../social/relationship/userBlockService'
import { getSocialSettings, setSocialSettings } from '../social/settings'
import { listRegisteredAgents } from '../social/agents/agentRegistry'
import { sessionIdForAgent } from '../social/agents/agentPaths'
import {
  createUserGroup,
  sendGroupMessage,
  leaveGroup,
  requestJoinGroup,
  listGroups,
  getGroup,
  listGroupMessages,
  listMembers,
  dissolveGroup,
} from '../social/group/groupService'
import { respondJoinRequest } from '../social/group/groupApproval'
import { runSocialTick } from '../social/tick/runSocialTick'
import { enqueueSocialEcho } from '../social/echo/socialEchoQueue'
import { writeUserFeedInteractionFact } from '../social/memory/socialMemoryWriter'
import { ACHIEVEMENT_DEFS } from '../social/achievement/achievementDefs'
import { checkAchievements } from '../social/achievement/achievementChecker'
import { runOfflineReplay } from '../social/offline/offlineReplay'
import { getDatabase } from '../db/database'
import { ensureDataLayout, loadSettings, resolveDataRoot } from './shared'

const DB_UNAVAILABLE_MSG =
  '本地数据库不可用。请在项目根目录执行：npx electron-builder install-app-deps 后重启（不要 npm rebuild better-sqlite3）。'

function rootOf(): string {
  const settings = loadSettings()
  const root = resolveDataRoot(settings)
  ensureDataLayout(root)
  return root
}

function requireDb(root: string): boolean {
  return getDatabase(root) != null
}

function mapFeedPost(root: string, p: ReturnType<typeof listPosts>[number], likedByMe: boolean) {
  const agents = listRegisteredAgents(root)
  const agent = agents.find((a) => a.id === p.author_id)
  const ints = listInteractions(root, p.id)
  return {
    id: p.id,
    authorId: p.author_id,
    authorName: agent?.name ?? p.author_id,
    avatarUrl: agent?.avatar_url ?? null,
    content: p.content,
    emotionLabel: p.emotion_label ?? null,
    createdAt: p.created_at,
    likes: ints.filter((i) => i.type === 'like').length,
    comments: ints
      .filter((i) => i.type === 'comment')
      .map((c) => {
        const who =
          c.actor_kind === 'user'
            ? '你'
            : (agents.find((a) => a.id === c.actor_id)?.name ?? c.actor_id)
        return {
          id: c.id,
          actorKind: c.actor_kind,
          actorId: c.actor_id,
          actorName: who,
          content: c.content ?? '',
          createdAt: c.created_at,
        }
      }),
    likedByMe,
  }
}

export function registerSocialFeedIpc(): void {
  ipcMain.handle('social:ensureSeeded', () => {
    const root = rootOf()
    if (!requireDb(root)) {
      return { ok: false as const, code: 'DATABASE_UNAVAILABLE', message: DB_UNAVAILABLE_MSG, seeded: 0 }
    }
    const members = listRegisteredAgents(root).filter((a) => a.kind === 'social_member')
    const n = seedPosts(
      root,
      members.map((m) => ({ id: m.id, name: m.name }))
    )
    try {
      unlockAchievement(root, 'first_visit')
    } catch {
      /* ignore */
    }
    return { ok: true as const, seeded: n }
  })

  ipcMain.handle('social:getFeed', (_e, args?: { limit?: number }) => {
    const root = rootOf()
    if (!requireDb(root)) {
      return { posts: [], hasMore: false, mode: 'plaza' as const, code: 'DATABASE_UNAVAILABLE' }
    }
    const friends = listFriendships(root, 'accepted').map((f) => f.agent_id)
    const feed = getFeed(root, friends, args?.limit ?? 40)
    const posts = feed.posts.map((p) =>
      mapFeedPost(root, p, hasLiked(root, p.id, 'user', 'local'))
    )
    return { posts, hasMore: false, mode: feed.mode }
  })

  ipcMain.handle('social:getAgentPosts', (_e, args: { agentId: string; limit?: number }) => {
    const root = rootOf()
    const posts = listPosts(root, args.agentId, args.limit ?? 30).map((p) =>
      mapFeedPost(root, p, hasLiked(root, p.id, 'user', 'local'))
    )
    return { posts }
  })

  ipcMain.handle('social:likePost', (_e, args: { postId: string }) => {
    const root = rootOf()
    const post = getPost(root, args.postId)
    if (!post) return { ok: false as const, code: 'NOT_FOUND' }
    const ok = addInteraction(root, {
      id: socialId('like'),
      post_id: args.postId,
      actor_kind: 'user',
      actor_id: 'local',
      type: 'like',
      content: null,
      sentiment: 0.5,
      created_at: new Date().toISOString(),
    })
    if (ok) {
      try {
        writeUserFeedInteractionFact(root, post.author_id, 'like', args.postId)
        const name =
          listRegisteredAgents(root).find((a) => a.id === post.author_id)?.name ?? '有人'
        enqueueSocialEcho(root, `${name}的动态被你点赞了。`)
        unlockAchievement(root, 'first_like')
      } catch {
        /* best effort */
      }
    }
    const likes = listInteractions(root, args.postId).filter((i) => i.type === 'like').length
    return { ok: true as const, likesCount: likes }
  })

  ipcMain.handle('social:commentPost', (_e, args: { postId: string; content: string }) => {
    const root = rootOf()
    const post = getPost(root, args.postId)
    if (!post) return { ok: false as const, code: 'NOT_FOUND' }
    const content = String(args.content ?? '').slice(0, 200).trim()
    if (!content) return { ok: false as const, code: 'EMPTY' }
    const banned = ['死全家', '自杀']
    if (banned.some((b) => content.includes(b))) return { ok: false as const, code: 'BLOCKED' }
    const id = socialId('cmt')
    addInteraction(root, {
      id,
      post_id: args.postId,
      actor_kind: 'user',
      actor_id: 'local',
      type: 'comment',
      content,
      sentiment: 0.4,
      created_at: new Date().toISOString(),
    })
    try {
      writeUserFeedInteractionFact(root, post.author_id, 'comment', args.postId)
      unlockAchievement(root, 'first_comment')
    } catch {
      /* */
    }
    return { ok: true as const, commentId: id }
  })

  ipcMain.handle('social:requestFriend', (_e, args: { agentId: string }) => {
    const root = rootOf()
    const row = listRegisteredAgents(root).find((a) => a.id === args.agentId)
    if (!row || row.kind !== 'social_member') return { success: false, status: 'rejected' as const }
    const sid = sessionIdForAgent(args.agentId)
    const st = loadCompanionStateFromDb(root, sid)
    const trust = st?.relationship?.trust ?? 40
    const aff = st?.emotion?.aff ?? 0
    try {
      const result = decideFriendship(root, args.agentId, { trust, aff, se: row.se })
      if (result.status === 'accepted') {
        try {
          unlockAchievement(root, 'first_friend')
        } catch {
          /* */
        }
      }
      return { success: true, status: result.status }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'FRIEND_REJECT_COOLDOWN') return { success: false, status: 'cooldown' as const }
      return { success: false, status: 'rejected' as const, message: msg }
    }
  })

  ipcMain.handle('social:listFriends', () => {
    const root = rootOf()
    const friends = listFriendships(root, 'accepted').map((f) => {
      const a = listRegisteredAgents(root).find((x) => x.id === f.agent_id)
      return {
        agentId: f.agent_id,
        agentName: a?.name ?? f.agent_id,
        since: f.responded_at ?? f.requested_at,
      }
    })
    return { friends, total: friends.length }
  })

  ipcMain.handle('social:getFriendship', (_e, args: { agentId: string }) => {
    const root = rootOf()
    const f = getFriendship(root, args.agentId)
    return { status: f?.status ?? null }
  })

  ipcMain.handle('social:muteAgent', (_e, args: { agentId: string }) => {
    const root = rootOf()
    muteAgent(root, args.agentId)
    try {
      unlockAchievement(root, 'mute_one')
    } catch {
      /* */
    }
    return { ok: true as const }
  })
  ipcMain.handle('social:blockAgent', (_e, args: { agentId: string }) => {
    blockAgent(rootOf(), args.agentId)
    return { ok: true as const }
  })
  ipcMain.handle('social:unmuteAgent', (_e, args: { agentId: string }) => {
    unblockAgent(rootOf(), args.agentId)
    return { ok: true as const }
  })
  ipcMain.handle('social:unblockAgent', (_e, args: { agentId: string }) => {
    unblockAgent(rootOf(), args.agentId)
    return { ok: true as const }
  })
  ipcMain.handle('social:listBlocks', () => ({ blocks: listBlocks(rootOf()) }))

  ipcMain.handle('social:getEvents', (_e, args?: { limit?: number }) => {
    const root = rootOf()
    const events = listSocialEvents(root, undefined, args?.limit ?? 50).map((e) => ({
      id: e.id,
      type: e.type,
      payload: (() => {
        try {
          return JSON.parse(e.payload)
        } catch {
          return e.payload
        }
      })(),
      createdAt: e.created_at,
    }))
    return { events }
  })

  ipcMain.handle('social:getNotifications', () => {
    const root = rootOf()
    const events = listSocialEvents(root, undefined, 20)
    return {
      count: events.length,
      items: events.map((e) => ({
        type: e.type,
        message: e.type,
        createdAt: e.created_at,
      })),
    }
  })

  ipcMain.handle('social:toggle', (_e, args: { enabled: boolean }) => {
    setSocialSettings(rootOf(), { enabled: args.enabled })
    return { success: true }
  })

  ipcMain.handle('social:getSocialSettings', () => getSocialSettings(rootOf()))
  ipcMain.handle('social:setSocialSettings', (_e, patch: Record<string, unknown>) =>
    setSocialSettings(rootOf(), {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : undefined,
      contentMode:
        patch.contentMode === 'llm' ? 'llm' : patch.contentMode === 'template' ? 'template' : undefined,
      tickMs: typeof patch.tickMs === 'number' ? patch.tickMs : undefined,
    })
  )

  ipcMain.handle('social:listGroups', () => {
    const root = rootOf()
    if (!requireDb(root)) return { groups: [], code: 'DATABASE_UNAVAILABLE' }
    return {
      groups: listGroups(root)
        .filter((g) => !g.dissolved_at)
        .map((g) => ({
          ...g,
          members: listMembers(root, g.id),
        })),
    }
  })

  ipcMain.handle('social:createGroup', (_e, args: { name: string; agentIds: string[] }) => {
    const root = rootOf()
    if (!requireDb(root)) {
      return { ok: false as const, code: 'DATABASE_UNAVAILABLE', message: DB_UNAVAILABLE_MSG }
    }
    const ids = [...new Set((args.agentIds ?? []).filter(Boolean))].slice(0, 4)
    if (ids.length < 1) {
      return { ok: false as const, code: 'NO_MEMBERS', message: '至少选择一位成员' }
    }
    const g = createUserGroup(root, String(args.name ?? '').trim(), ids)
    return { ok: true as const, group: g }
  })

  ipcMain.handle('social:requestJoinGroup', (_e, args: { groupId: string }) => {
    const root = rootOf()
    const id = requestJoinGroup(root, args.groupId)
    const g = getGroup(root, args.groupId)
    let trust = 55
    let aff = 1
    let se = 50
    if (g?.owner_kind === 'agent') {
      const st = loadCompanionStateFromDb(root, sessionIdForAgent(g.owner_id))
      trust = st?.relationship?.trust ?? 55
      aff = st?.emotion?.aff ?? 1
      const row = listRegisteredAgents(root).find((a) => a.id === g.owner_id)
      se = row?.se ?? 50
    }
    const { accepted } = respondJoinRequest(root, id, { trust, aff, se })
    if (accepted) {
      try {
        unlockAchievement(root, 'first_group_join')
      } catch {
        /* */
      }
    }
    return { ok: true as const, requestId: id, status: accepted ? 'accepted' : 'rejected' }
  })

  ipcMain.handle('social:leaveGroup', (_e, args: { groupId: string }) => {
    leaveGroup(rootOf(), args.groupId, 'user', 'local')
    return { ok: true as const }
  })

  ipcMain.handle('social:dissolveGroup', (_e, args: { groupId: string }) => {
    dissolveGroup(rootOf(), args.groupId)
    return { ok: true as const }
  })

  ipcMain.handle('social:getGroupMessages', (_e, args: { groupId: string; limit?: number }) => {
    const root = rootOf()
    return { messages: listGroupMessages(root, args.groupId, args.limit ?? 100) }
  })

  ipcMain.handle('social:sendGroupMessage', (_e, args: { groupId: string; content: string }) => {
    const root = rootOf()
    const result = sendGroupMessage(root, args.groupId, String(args.content ?? '').slice(0, 500))
    try {
      unlockAchievement(root, 'first_group_msg')
    } catch {
      /* */
    }
    return { ok: true as const, ...result }
  })

  ipcMain.handle('social:getAchievements', () => {
    const root = rootOf()
    if (!requireDb(root)) {
      return { defs: ACHIEVEMENT_DEFS, unlocked: [], code: 'DATABASE_UNAVAILABLE' }
    }
    const unlockedIds = new Set(listAchievements(root).map((u) => u.achievement_id))
    return {
      defs: ACHIEVEMENT_DEFS,
      unlocked: ACHIEVEMENT_DEFS.filter((d) => unlockedIds.has(d.id)),
    }
  })

  ipcMain.handle('social:runTickNow', async () => {
    const root = rootOf()
    const result = await runSocialTick(root)
    checkAchievements(root, 'tick')
    return { ok: true as const, result }
  })

  ipcMain.handle('social:getOfflineReplay', () => {
    const root = rootOf()
    if (!requireDb(root)) {
      return { show: false as const, hours: 0, narrative: '', eventCount: 0, postsCreated: 0, alreadyApplied: false }
    }
    return runOfflineReplay(root)
  })

  ipcMain.handle('social:ackOfflineReplay', () => {
    const root = rootOf()
    if (!requireDb(root)) return { ok: false as const, code: 'DATABASE_UNAVAILABLE' }
    setSocialMeta(root, 'last_social_active_at', new Date().toISOString())
    return { ok: true as const }
  })
}
