import { getDatabase } from '../../db/database.js'
import { createActionCoordinator } from '../actions/actionCoordinator.js'
import { ActionRepository } from '../actions/actionRepository.js'
import { recoverActionProjections } from '../actions/actionRecovery.js'
import { getMemorySystem } from '../bootstrap.js'
import type { MemorySystem } from '../memorySystem.js'
import type {
  ActionRun,
  MemoryRecordCommand,
  MemoryRecordResult,
  NewActionRun,
  RuntimeSnapshot,
  TrustedHostReceipt
} from '../contracts.js'
import type { Clock } from '../temporal/clock.js'
import { getClock } from '../temporal/clock.js'
import { applyAckemCodeReceipt, snapshotStatusForReceipt } from './ackemCodeMemoryAdapter.js'
import { applyPluginReceipt } from './pluginMemoryAdapter.js'
import { createChatLedgerMemorySystem } from './chatMemoryAdapter.js'
import { scheduleRecallLatencySample } from '../audit/auditMetricsStore.js'

export type RuntimeReceiptLoader = (runtimeId: string) => Promise<TrustedHostReceipt | undefined>

export type ActionPort = {
  record(command: MemoryRecordCommand): MemoryRecordResult
  getAction(runId: string): ActionRun | null
  listOpen(sessionId: string): ActionRun[]
  promoteNext(sessionId: string): MemoryRecordResult
  listPromotableSessions(): string[]
  bindRuntime(runId: string, runtimeId: string): void
}

export function createAckemMemorySystem(
  dataRoot: string,
  clock: Clock = getClock(),
  opts: { loadReceipt?: RuntimeReceiptLoader } = {}
): MemorySystem {
  const chat = createChatLedgerMemorySystem(dataRoot, clock)
  const coordinator = createActionCoordinator(dataRoot, { clock })
  return {
    record(command) {
      if (command.kind === 'action.created') return coordinator.create(command.action)
      if (command.kind === 'action.transitioned') return coordinator.transition(command.transition)
      if (command.kind === 'runtime.received') {
        if (command.receipt.source === 'plugin') return applyPluginReceipt(coordinator, command.receipt, dataRoot)
        return applyAckemCodeReceipt(coordinator, command.receipt, dataRoot)
      }
      return chat.record(command)
    },
    async recall(query) {
      const t0 = performance.now()
      const bundle = await chat.recall(query)
      scheduleRecallLatencySample(dataRoot, performance.now() - t0)
      return bundle
    },
    control: (command) => chat.control(command),
    async recover() {
      const snapshots = await loadWorkSnapshots(dataRoot, coordinator, opts.loadReceipt)
      return recoverActionProjections(dataRoot, {
        coordinator,
        runtimeSnapshots: snapshots,
        now: clock.now().toISOString()
      })
    }
  }
}

async function loadWorkSnapshots(
  dataRoot: string,
  coordinator: ReturnType<typeof createActionCoordinator>,
  loadReceipt: RuntimeReceiptLoader | undefined
): Promise<RuntimeSnapshot[]> {
  if (!loadReceipt) return []
  const db = getDatabase(dataRoot)
  if (!db) return []
  void coordinator
  const open = db
    .prepare(
      `SELECT run_id, runtime_id FROM memory_action_runs
       WHERE nature = 'work' AND runtime_id IS NOT NULL
         AND status IN ('running','waiting_permission','unknown')`
    )
    .all() as Array<{ run_id: string; runtime_id: string }>
  const snapshots: RuntimeSnapshot[] = []
  for (const row of open) {
    try {
      const receipt = await loadReceipt(row.runtime_id)
      if (!receipt || receipt.hostRunId !== row.run_id) continue
      const status = snapshotStatusForReceipt(receipt.state)
      if (!status) continue
      if (status !== 'running' && status !== 'waiting_permission' && status !== 'succeeded' && status !== 'failed' && status !== 'aborted') {
        continue
      }
      snapshots.push({
        runId: row.run_id,
        runtimeId: row.runtime_id,
        runtimeRevision: receipt.revision,
        status,
        observedAt: receipt.updatedAt,
        errorCode: receipt.errorCode
      })
    } catch {
      // Leave the run for orphan handling. A failed read is not a success.
    }
  }
  return snapshots
}

export function openActionPort(dataRoot: string): ActionPort | null {
  let memory: MemorySystem
  try {
    memory = getMemorySystem(dataRoot)
  } catch {
    return null
  }
  const coordinator = createActionCoordinator(dataRoot)
  return {
    record: (command) => memory.record(command),
    getAction: (runId) => coordinator.getCurrent(runId),
    listOpen: (sessionId) => coordinator.listOpen(sessionId),
    promoteNext: (sessionId) => coordinator.promoteNext(sessionId),
    listPromotableSessions() {
      const db = getDatabase(dataRoot)
      if (!db) return []
      return new ActionRepository(db).listPromotableSessions()
    },
    bindRuntime(runId, runtimeId) {
      const db = getDatabase(dataRoot)
      if (!db) return
      new ActionRepository(db).bindRuntime(runId, runtimeId)
    }
  }
}

export function sessionHasLiveWork(port: ActionPort, sessionId: string, exceptRunId?: string): boolean {
  return port.listOpen(sessionId).some(
    (run) =>
      run.nature === 'work' &&
      run.runId !== exceptRunId &&
      (run.status === 'running' || run.status === 'waiting_permission' || run.status === 'unknown')
  )
}

export function findLivePlugin(port: ActionPort, sessionId: string, extensionId: string): ActionRun | null {
  return (
    port.listOpen(sessionId).find(
      (run) => run.nature === 'plugin' && run.targetId === extensionId && (run.status === 'running' || run.status === 'waiting_permission')
    ) ?? null
  )
}

export type { NewActionRun }
