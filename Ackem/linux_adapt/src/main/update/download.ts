import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { UpdateProgressEvent } from '../../shared/updateTypes'
import { UPDATE_USER_AGENT } from './config'

export async function downloadReleaseZip(
  url: string,
  destPath: string,
  expectedSize: number,
  onProgress: (ev: UpdateProgressEvent) => void
): Promise<void> {
  const partPath = `${destPath}.part`
  let startAt = 0
  if (existsSync(partPath)) {
    startAt = statSync(partPath).size
  } else if (existsSync(destPath)) {
    rmSync(destPath, { force: true })
  }

  const headers: Record<string, string> = {
    'User-Agent': UPDATE_USER_AGENT,
    Accept: '*/*'
  }
  if (startAt > 0) {
    headers.Range = `bytes=${startAt}-`
  }

  const res = await fetch(url, { headers })
  if (!res.ok && res.status !== 206) {
    throw new Error(`Download failed: HTTP ${res.status}`)
  }

  const contentRange = res.headers.get('content-range')
  let totalBytes = expectedSize
  if (contentRange) {
    const m = /\/(\d+)$/.exec(contentRange)
    if (m) totalBytes = Number(m[1])
  } else {
    const len = res.headers.get('content-length')
    if (len) totalBytes = startAt + Number(len)
  }

  mkdirSync(dirname(destPath), { recursive: true })

  const body = res.body
  if (!body) throw new Error('No response body')

  let downloadedBytes = startAt
  let lastTick = Date.now()
  let lastBytes = downloadedBytes
  const nodeStream = Readable.from(
    (async function* () {
      const reader = body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          downloadedBytes += value.length
          const now = Date.now()
          if (now - lastTick >= 500) {
            const speedBps = ((downloadedBytes - lastBytes) / (now - lastTick)) * 1000
            lastBytes = downloadedBytes
            lastTick = now
            onProgress({
              phase: 'download',
              message: 'Downloading…',
              percent: totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : undefined,
              downloadedBytes,
              totalBytes,
              speedBps
            })
          }
          yield Buffer.from(value)
        }
      } finally {
        reader.releaseLock()
      }
    })()
  )

  await pipeline(nodeStream, createWriteStream(partPath, { flags: startAt > 0 && res.status === 206 ? 'a' : 'w' }))

  if (totalBytes > 0 && downloadedBytes !== totalBytes) {
    throw new Error(`Incomplete download (${downloadedBytes}/${totalBytes} bytes)`)
  }

  rmSync(destPath, { force: true })
  renameSync(partPath, destPath)

  onProgress({
    phase: 'download',
    message: 'Download complete',
    percent: 100,
    downloadedBytes,
    totalBytes: totalBytes || downloadedBytes,
    speedBps: 0
  })
}
