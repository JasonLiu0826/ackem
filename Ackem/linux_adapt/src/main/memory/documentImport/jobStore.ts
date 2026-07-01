import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ImportJob } from '../../../shared/documentImport'

const JOB_DIR = 'import-jobs'

function jobDir(dataRoot: string): string {
  return join(dataRoot, '_derived', JOB_DIR)
}

function jobPath(dataRoot: string, jobId: string): string {
  return join(jobDir(dataRoot), `${jobId}.json`)
}

export function saveImportJob(dataRoot: string, job: ImportJob): void {
  mkdirSync(jobDir(dataRoot), { recursive: true })
  writeFileSync(jobPath(dataRoot, job.id), JSON.stringify(job, null, 2), 'utf-8')
}

export function loadImportJob(dataRoot: string, jobId: string): ImportJob | null {
  const p = jobPath(dataRoot, jobId)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as ImportJob
  } catch {
    return null
  }
}

export function updateImportJob(
  dataRoot: string,
  jobId: string,
  patch: Partial<ImportJob>
): ImportJob | null {
  const job = loadImportJob(dataRoot, jobId)
  if (!job) return null
  const next = { ...job, ...patch }
  saveImportJob(dataRoot, next)
  return next
}
