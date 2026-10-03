/**
 * Public memory seam. Do not re-export repositories or internal policy.
 * Concrete MemorySystem is injected via bootstrap factory (Task 10+).
 */
export type { MemorySystem } from './memorySystem.js'
export {
  MEMORY_SYSTEM_FACTORY_NOT_REGISTERED,
  MemorySystemFactoryNotRegisteredError,
  getMemorySystem,
  registerMemorySystemFactory,
  resetMemorySystemForTests,
  type MemorySystemFactory
} from './bootstrap.js'
export type {
  ActionRun,
  ActionStatus,
  InteractionSurface,
  MemoryControlCommand,
  MemoryControlResult,
  MemoryNature,
  MemoryRecordCommand,
  MemoryRecordResult,
  MemoryRecoveryReport,
  RecallBundle,
  RecallQuery
} from './contracts.js'
export type {
  AgeMeta,
  FactChangeSet,
  FactLayer,
  MemoryEmotionalContext,
  MemoryFact,
  MemoryFactStatus,
  MemoryTier
} from './semantic/types.js'
export type { Episode, EpisodeEvidence } from './episodes/types.js'
