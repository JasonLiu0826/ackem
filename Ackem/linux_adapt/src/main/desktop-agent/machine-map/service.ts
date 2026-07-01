import type { GamesFindingsReport } from '../../../shared/investigation'
import {
  isMachineMapStale,
  type MachineMapStatus
} from '../../../shared/machineMap'
import { getMachineMapDb } from './db'
import { isMachineMapIndexRunning, scheduleMachineMapIndex } from './indexer'
import {
  countActive,
  getLatestScanStatus,
  getMeta,
  listActiveGames,
  mapRowsToGamesFindings,
  upsertGamesFromReport
} from './repo'

export function getMachineMapStatus(dataRoot: string): MachineMapStatus {
  const db = getMachineMapDb(dataRoot)
  if (!db) {
    return {
      status: 'idle',
      lastCompleteAt: null,
      gameCount: 0,
      documentCount: 0,
      lastScanRunId: null,
      isStale: true
    }
  }
  const lastCompleteAt = getMeta(db, 'last_complete_at')
  const lastScanRunId = getMeta(db, 'last_scan_run_id')
  let status = getLatestScanStatus(db)
  if (isMachineMapIndexRunning(dataRoot)) {
    status = 'running'
  }
  return {
    status,
    lastCompleteAt,
    gameCount: countActive(db, 'game'),
    documentCount: countActive(db, 'document'),
    lastScanRunId,
    isStale: isMachineMapStale(lastCompleteAt)
  }
}

export function buildGamesReportFromMap(dataRoot: string): GamesFindingsReport | null {
  const status = getMachineMapStatus(dataRoot)
  if (status.status !== 'complete' || status.isStale || status.gameCount === 0) {
    return null
  }
  const db = getMachineMapDb(dataRoot)
  if (!db) return null
  const rows = listActiveGames(db)
  if (rows.length === 0) return null
  return mapRowsToGamesFindings(rows)
}

export function upsertLiveGamesToMap(dataRoot: string, report: GamesFindingsReport): void {
  const db = getMachineMapDb(dataRoot)
  if (!db) return
  const runId = getMeta(db, 'last_scan_run_id') ?? `live-${Date.now()}`
  upsertGamesFromReport(db, report, runId)
}

export function maybeRefreshMachineMap(dataRoot: string, trigger: string): void {
  const status = getMachineMapStatus(dataRoot)
  if (status.status === 'running') return
  if (status.status === 'idle' || status.isStale) {
    scheduleMachineMapIndex(dataRoot, trigger)
  }
}

export { scheduleMachineMapIndex, isMachineMapIndexRunning } from './indexer'
