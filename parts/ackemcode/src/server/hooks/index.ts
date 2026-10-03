export type {
  HookEventName,
  HooksConfig,
  HookMatcherGroup,
  HookConfig,
  AggregatedHookResult,
  HookInput
} from './types.js'
export { HOOK_EVENTS, HOOK_EVENTS_MVP } from './types.js'
export {
  runHooks,
  isHooksDisabled,
  clearOnceHooks,
  matchQueryForEvent
} from './runner.js'
export {
  matcherMatchesTool,
  matcherMatchesQuery,
  ifConditionMatches,
  selectHooks,
  resolveFileChangedMatcherPaths
} from './match.js'
export { aggregateHookResults } from './merge.js'
export { executeHook } from './execute.js'
export {
  initializeFileChangedWatcher,
  updateHooksConfigForWatcher,
  updateWatchPaths,
  onCwdChangedForHooks,
  executeFileChangedHooks,
  executeCwdChangedHooks,
  setFileChangedNotifier,
  disposeFileChangedWatcher,
  resetFileChangedWatcherForTesting,
  getFileChangedWatcherState,
  __testFireFileChanged
} from './fileChangedWatcher.js'
export {
  ENV_FILE_HOOK_EVENTS,
  clearCwdEnvFiles,
  getHookEnvFilePath,
  getSessionEnvDirPath,
  getSessionHookEnvVars,
  invalidateSessionEnvCache,
  isEnvFileHookEvent,
  loadSessionEnvExports,
  parseEnvExportLines,
  setSessionEnvSessionId,
  shouldPassClaudeEnvFile
} from './sessionEnv.js'
export {
  emitInstructionsLoadedHooks,
  inferInstructionMemoryType
} from './instructionsLoaded.js'
