export {
  FileHistory,
  createFileHistoryState,
  serializeFileHistoryState,
  parseFileHistoryState,
  loadFileHistoryState,
  saveFileHistoryState,
  clearFileHistoryPersistence,
  type FileHistoryState,
  type FileHistorySnapshot,
  type RewindResult
} from './fileHistory.js'
export {
  fileHistoryEnabled,
  shouldTrackPath,
  getFileHistoryBackupRoot,
  getFileHistoryStatePath
} from './paths.js'
export { MAX_SNAPSHOTS, FILE_HISTORY_STATE_VERSION } from './types.js'
export type { FileHistoryStateJson } from './types.js'
