/**
 * social/index — 社会域对外 re-export
 */

export { PRIMARY_AGENT_ID, sessionIdForAgent, agentFileRoot, agentCardDir } from './agents/agentPaths'
export { isPrimaryCompanion, isSocialMember } from './agents/guards'
export {
  withAgentContext,
  getCurrentAgentId,
  getCurrentInteractionSurface,
  runWithAgentContextSync,
} from './agents/withAgentContext'
export {
  seedIfNeeded,
  listRegisteredAgents,
  getRegisteredAgent,
  invalidateAgentCache,
} from './agents/agentRegistry'
export { social3dForPreset } from './social3dPresets'

export { SOCIAL } from './types'
export type { ContentMode, SocialEmotion } from './types'
export { getSocialSettings, setSocialSettings } from './settings'
export type { SocialSettings } from './settings'

export { startSocialTick, stopSocialTick, isSocialTickRunning } from './tick/socialScheduler'
export { runSocialTick } from './tick/runSocialTick'
export type { SocialTickResult } from './tick/runSocialTick'
export { markChatInFlight, clearChatInFlight, isChatInFlight } from './tick/chatInFlight'

export { applyGraphAction } from './relationship/socialGraphService'
export { stageForTrust } from './relationship/stage'
export {
  shouldAcceptFriendship,
  requestFriendship,
  decideFriendship,
} from './relationship/userFriendshipService'
export {
  muteAgent,
  blockAgent,
  unblockAgent,
  isMuted,
  isBlocked,
  listBlocks,
} from './relationship/userBlockService'

export { socialSignal, likeProbability, commentProbability } from './feed/socialSignal'
export { shouldPost, postRate } from './feed/postDecision'
export { getFeed, createPost, listPosts } from './feed/friendCircleService'
export type { FeedMode } from './feed/friendCircleService'
export { generatePost, setSocialLlmGenerator } from './feed/contentService'
export { wireSocialLlmGenerator } from './feed/wireSocialLlm'
export { seedPosts } from './feed/seedPosts'

export { detectJealousy } from './jealousy/jealousy'
export { buildSocialEchoBlock } from './echo/buildSocialEchoBlock'
export { enqueueSocialEcho, consumeSocialEchoes } from './echo/socialEchoQueue'
export { writeSocialFact, buildSocialProvenance } from './memory/socialMemoryWriter'
export { selectGroupResponders } from './group/groupRouter'
export { createUserGroup, sendGroupMessage, leaveGroup } from './group/groupService'
export { tryFormGroup } from './group/groupFormation'
export { shouldApproveJoin, respondJoinRequest } from './group/groupApproval'
export { groupReply, suggestGroupName } from './group/groupReply'
export { ACHIEVEMENT_DEFS } from './achievement/achievementDefs'
export { checkAchievements } from './achievement/achievementChecker'
export { offlineEventCount, runOfflineReplay } from './offline/offlineReplay'
export type { OfflineReplayResult } from './offline/offlineReplay'
export { offlinePressure } from './offline/offlinePressure'
export { interpretSocialEvent } from './observe/socialInterpreter'
