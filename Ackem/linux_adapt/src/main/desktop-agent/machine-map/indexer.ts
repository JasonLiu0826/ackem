import { broadcastToRenderers } from '../../rendererBroadcast'
import { createLogger } from '../../logger'
import { yieldToEventLoop } from '../investigation/yieldEventLoop'
import type { MachineMapProgressPayload } from '../../../shared/machineMap'
import { buildMachineMapSteps } from './collector'
import { getMachineMapDb } from './db'
import {
  createScanRun,
  deactivateGamesNotInRun,
  finishScanRun,
  updateScanRunProgress,
  upsertMapEntry
} from './repo'

const log = createLogger('machine-map.indexer')

const runningByRoot = new Set<string>()

function emitProgress(payload: MachineMapProgressPayload): void {
  broadcastToRenderers('machine-map:progress', payload)
}

export type RunMachineMapIndexOptions = {
  trigger: string
}

export async function runMachineMapIndex(
  dataRoot: string,
  opts: RunMachineMapIndexOptions
): Promise<void> {
  if (runningByRoot.has(dataRoot)) {
    log.info('machine-map.skip', { reason: 'already_running', trigger: opts.trigger })
    return
  }
  runningByRoot.add(dataRoot)

  const db = getMachineMapDb(dataRoot)
  if (!db) {
    runningByRoot.delete(dataRoot)
    log.warn('machine-map.skip', { reason: 'db_unavailable', trigger: opts.trigger })
    return
  }
  const steps = buildMachineMapSteps('pending')
  const scanRunId = createScanRun(db, opts.trigger, steps.length)
  const stepsWithRun = buildMachineMapSteps(scanRunId)

  log.info('machine-map.start', { scanRunId, trigger: opts.trigger, steps: steps.length })
  emitProgress({
    status: 'running',
    done: 0,
    total: stepsWithRun.length,
    label: '正在努力理解你的电脑中…',
    scanRunId
  })

  try {
    for (let i = 0; i < stepsWithRun.length; i++) {
      const step = stepsWithRun[i]
      await yieldToEventLoop()
      updateScanRunProgress(db, scanRunId, i, step.id)
      emitProgress({
        status: 'running',
        done: i,
        total: stepsWithRun.length,
        label: `正在努力理解你的电脑中… · ${step.label}`,
        scanRunId
      })

      try {
        const entries = await step.run()
        for (const ent of entries) {
          upsertMapEntry(db, ent)
        }
        log.info('machine-map.step', { step: step.id, hits: entries.length })
      } catch (e) {
        log.warn('machine-map.step.error', {
          step: step.id,
          error: e instanceof Error ? e.message : String(e)
        })
      }

      const gameCountMid = (
        db
          .prepare(`SELECT COUNT(*) AS c FROM map_entries WHERE category = 'game' AND active = 1`)
          .get() as { c: number }
      ).c
      emitProgress({
        status: 'running',
        done: i + 1,
        total: stepsWithRun.length,
        label: `正在努力理解你的电脑中… · ${step.label}`,
        scanRunId,
        gameCount: gameCountMid
      })
    }

    deactivateGamesNotInRun(db, scanRunId)
    finishScanRun(db, scanRunId, 'complete')

    const gameCount = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM map_entries WHERE category = 'game' AND active = 1`)
        .get() as { c: number }
    ).c
    const documentCount = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM map_entries WHERE category = 'document' AND active = 1`)
        .get() as { c: number }
    ).c

    emitProgress({
      status: 'complete',
      done: stepsWithRun.length,
      total: stepsWithRun.length,
      label: '本机地图已就绪',
      scanRunId,
      gameCount,
      documentCount
    })
    log.info('machine-map.complete', { scanRunId, gameCount, documentCount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    finishScanRun(db, scanRunId, 'error', msg)
    emitProgress({
      status: 'error',
      done: 0,
      total: stepsWithRun.length,
      label: '本机地图索引失败',
      scanRunId,
      error: msg
    })
    log.error('machine-map.error', { scanRunId, error: msg })
  } finally {
    runningByRoot.delete(dataRoot)
  }
}

export function scheduleMachineMapIndex(dataRoot: string, trigger: string): void {
  setImmediate(() => {
    void runMachineMapIndex(dataRoot, { trigger })
  })
}

export function isMachineMapIndexRunning(dataRoot: string): boolean {
  return runningByRoot.has(dataRoot)
}
