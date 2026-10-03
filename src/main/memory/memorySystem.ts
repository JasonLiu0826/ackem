import type {
  MemoryControlCommand,
  MemoryControlResult,
  MemoryRecordCommand,
  MemoryRecordResult,
  MemoryRecoveryReport,
  RecallBundle,
  RecallQuery
} from './contracts.js'

/**
 * Deep-module Interface only. No stub / Noop implementation here.
 * Concrete wiring is registered through `registerMemorySystemFactory`.
 * Unregistered access throws MEMORY_SYSTEM_FACTORY_NOT_REGISTERED.
 */
export interface MemorySystem {
  record(command: MemoryRecordCommand): MemoryRecordResult
  recall(query: RecallQuery): Promise<RecallBundle>
  control(command: MemoryControlCommand): Promise<MemoryControlResult>
  recover(): Promise<MemoryRecoveryReport>
}
