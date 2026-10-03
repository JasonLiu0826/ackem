export {
  hydrateChatHistoryFromLegacyIfNeeded,
  purgeTurnFromDb,
  projectLegacyChatHistoryFromDb,
  reconcileLegacyChatProjectionFromDb,
  isLegacyChatProjectionStale,
  purgeTurnFromUnifiedHistory,
  setLegacyChatWriteHookForTests
} from './chatHistoryProjection.js'
