import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { app } from 'electron'
import type { UpdateJob, UpdateStartRequest } from '../../shared/updateTypes'
import { greenFolderName } from './config'
import { spawnLauncherProcess } from './preflight'

export function buildUpdateJob(
  installDir: string,
  req: UpdateStartRequest,
  resolvedChannel: 'github' | 'gitee'
): UpdateJob {
  const base = join(tmpdir(), 'Ackem-update')
  mkdirSync(base, { recursive: true })
  const zipPath = join(base, `Ackem-${req.targetVersion}-win-x64.zip`)
  const extractDir = join(base, 'extract')
  const stagingDir = join(extractDir, greenFolderName(req.targetVersion))
  return {
    installDir,
    currentVersion: app.getVersion(),
    targetVersion: req.targetVersion,
    channel: resolvedChannel,
    downloadUrl: req.downloadUrl,
    expectedSize: req.expectedSize,
    releasePageUrl: req.releasePageUrl,
    zipPath,
    stagingDir,
    extractDir,
    AckemExe: join(installDir, 'Ackem.exe')
  }
}

export function writeUpdateJob(job: UpdateJob): string {
  const jobPath = join(tmpdir(), 'Ackem-update', 'job.json')
  mkdirSync(join(tmpdir(), 'Ackem-update'), { recursive: true })
  writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8')
  return jobPath
}

export function spawnUpdaterProcess(installDir: string, jobPath: string): void {
  spawnLauncherProcess(installDir, jobPath)
}
