import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import type { UpdateJob, UpdateProgressEvent } from '../../shared/updateTypes'
import { greenFolderName } from './config'
import { downloadReleaseZip } from './download'
import { syncReleaseFromStaging } from './installSync'
import { extractZip, testZipIntegrity } from './zipVerify'

function resolveStagingDir(extractDir: string, version: string): string {
  const named = join(extractDir, greenFolderName(version))
  if (existsSync(join(named, 'Ackem.exe'))) return named
  if (existsSync(join(extractDir, 'Ackem.exe'))) return extractDir
  for (const entry of readdirSync(extractDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(extractDir, entry.name)
    if (existsSync(join(candidate, 'Ackem.exe'))) return candidate
  }
  throw new Error(`Missing Ackem.exe in extracted package under ${extractDir}`)
}

function emit(win: Electron.BrowserWindow | null, ev: UpdateProgressEvent): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:progress', ev)
  }
}

export async function runUpdatePipeline(job: UpdateJob, win: Electron.BrowserWindow | null): Promise<void> {
  const send = (ev: UpdateProgressEvent) =>
    emit(win, {
      ...ev,
      channel: job.channel,
      fromVersion: job.currentVersion,
      toVersion: job.targetVersion
    })

  try {
    mkdirSync(job.extractDir, { recursive: true })

    send({ phase: 'download', message: `Source: ${job.channel === 'github' ? 'GitHub Releases' : 'Gitee Releases'}` })
    send({
      phase: 'download',
      message: `Version ${job.currentVersion} 鈫?${job.targetVersion}`,
      totalBytes: job.expectedSize
    })

    await downloadReleaseZip(job.downloadUrl, job.zipPath, job.expectedSize, send)

    send({ phase: 'verify', message: 'Verifying download size鈥?, percent: 0 })
    const size = statSync(job.zipPath).size
    if (job.expectedSize > 0 && size !== job.expectedSize) {
      throw new Error(`Size mismatch: expected ${job.expectedSize}, got ${size}`)
    }

    send({ phase: 'verify', message: 'Testing zip integrity (7za)鈥?, percent: 50 })
    testZipIntegrity(job.zipPath)

    send({ phase: 'verify', message: 'Checksum OK', percent: 100 })

    if (existsSync(job.extractDir)) {
      rmSync(job.extractDir, { recursive: true, force: true })
    }
    mkdirSync(job.extractDir, { recursive: true })

    send({ phase: 'extract', message: 'Extracting release package鈥?, percent: 10 })
    extractZip(job.zipPath, job.extractDir)

    const stagingDir = resolveStagingDir(job.extractDir, job.targetVersion)
    if (!existsSync(join(stagingDir, 'Ackem.exe'))) {
      throw new Error(`Extracted package missing Ackem.exe in ${stagingDir}`)
    }

    send({ phase: 'extract', message: 'Extract complete', percent: 100 })

    send({ phase: 'install', message: 'Installing program files (data/ preserved)鈥?, percent: 20 })
    syncReleaseFromStaging(stagingDir, job.installDir)
    send({ phase: 'install', message: 'Install complete', percent: 100 })

    send({
      phase: 'done',
      message: 'Update finished 鈥?you can restart Ackem',
      percent: 100
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    send({ phase: 'error', message: msg })
    throw e
  }
}

export function launchAckem(exePath: string): void {
  spawn(exePath, [], { detached: true, stdio: 'ignore', cwd: dirname(exePath) })
}

export function readUpdateJob(jobPath: string): UpdateJob {
  return JSON.parse(readFileSync(jobPath, 'utf-8')) as UpdateJob
}
