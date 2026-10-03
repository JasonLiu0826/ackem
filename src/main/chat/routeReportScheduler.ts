/**
 * Route v2 阶段 1 二批 — daily route report scheduler.
 *
 * Every 6h (and once at start) it writes {dataRoot}/logs/route-daily-report.json
 * covering the trailing 24h window. Pure ledger reads; failures are logged and
 * never thrown (a reporting failure must not disturb chat). Stop is registered
 * in shutdown.ts alongside the other background services.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../logger.js'
import { getDatabase } from '../db/database.js'
import { buildRouteDailyReport, yesterdayWindowUtc } from './routeDailyReport.js'

const log = createLogger('route-report')

const INTERVAL_MS = 6 * 60 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

export function routeDailyReportPath(dataRoot: string): string {
  return join(dataRoot, 'logs', 'route-daily-report.json')
}

export function writeRouteDailyReport(dataRoot: string, now = new Date()): boolean {
  try {
    const db = getDatabase(dataRoot)
    if (!db) return false
    const { start, end } = yesterdayWindowUtc(now)
    const report = buildRouteDailyReport(db, start, end, now.toISOString())
    mkdirSync(join(dataRoot, 'logs'), { recursive: true })
    writeFileSync(routeDailyReportPath(dataRoot), JSON.stringify(report, null, 2), 'utf8')
    return true
  } catch (e) {
    log.warn('route daily report failed', { error: e instanceof Error ? e.message : String(e) })
    return false
  }
}

export function startRouteReportScheduler(dataRoot: string): void {
  stopRouteReportScheduler()
  timer = setInterval(() => {
    writeRouteDailyReport(dataRoot)
  }, INTERVAL_MS)
  timer.unref?.()
  // First report immediately (file write, not a chat-path dependency).
  writeRouteDailyReport(dataRoot)
  log.info('route report scheduler started', { intervalMs: INTERVAL_MS })
}

export function stopRouteReportScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export function isRouteReportSchedulerRunning(): boolean {
  return timer !== null
}

// Test seam: run one report synchronously.
export function runRouteReportOnceForTests(dataRoot: string): boolean {
  return writeRouteDailyReport(dataRoot)
}
