/**
 * R9-DURCRON · Durable cron persistence (CC cronTasks.ts spirit).
 *
 * Session jobs stay in-memory. Jobs created with durable:true are also
 * written to ~/.ackemcode/scheduled_tasks.json (atomic tmp+rename) and
 * rehydrated on process restart.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { CronJob } from './cronStore.js'

export const DURABLE_CRON_FILE_VERSION = 1

export type DurableCronFile = {
  version: number
  updatedAt: string
  jobs: CronJob[]
}

export function durableCronPath(override?: string): string {
  if (override) return override
  const env = process.env.ACKEM_DURABLE_CRON_PATH?.trim()
  if (env) return path.resolve(env)
  return path.join(os.homedir(), '.ackemcode', 'scheduled_tasks.json')
}

/** Strip session-only fields that shouldn't matter; keep fire timing. */
export function toDurableJob(job: CronJob): CronJob {
  return {
    id: job.id,
    cron: job.cron,
    prompt: job.prompt,
    recurring: job.recurring,
    createdAt: job.createdAt,
    nextRunAt: job.nextRunAt,
    lastFiredAt: job.lastFiredAt,
    fireCount: job.fireCount,
    durable: true
  }
}

export async function loadDurableCronJobs(
  filePath = durableCronPath()
): Promise<CronJob[]> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as DurableCronFile
    if (!parsed || !Array.isArray(parsed.jobs)) return []
    return parsed.jobs
      .filter(
        (j): j is CronJob =>
          !!j &&
          typeof j.id === 'string' &&
          typeof j.cron === 'string' &&
          typeof j.prompt === 'string' &&
          typeof j.nextRunAt === 'number'
      )
      .map((j) => ({
        id: j.id,
        cron: j.cron,
        prompt: j.prompt,
        recurring: j.recurring !== false,
        createdAt: typeof j.createdAt === 'number' ? j.createdAt : Date.now(),
        nextRunAt: j.nextRunAt,
        lastFiredAt:
          typeof j.lastFiredAt === 'number' ? j.lastFiredAt : undefined,
        fireCount: typeof j.fireCount === 'number' ? j.fireCount : 0,
        durable: true
      }))
  } catch {
    return [] // missing / corrupt → empty (fail-soft)
  }
}

/**
 * Contract 1: atomic persist (write tmp → rename). Only durable jobs are
 * written; session-only jobs must never appear in this file.
 */
export async function saveDurableCronJobs(
  jobs: CronJob[],
  filePath = durableCronPath()
): Promise<void> {
  const durable = jobs.filter((j) => j.durable).map(toDurableJob)
  const dir = path.dirname(filePath)
  await mkdir(dir, { recursive: true })
  const payload: DurableCronFile = {
    version: DURABLE_CRON_FILE_VERSION,
    updatedAt: new Date().toISOString(),
    jobs: durable
  }
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const body = JSON.stringify(payload, null, 2)
  await writeFile(tmp, body, 'utf8')
  await rename(tmp, filePath)
}
