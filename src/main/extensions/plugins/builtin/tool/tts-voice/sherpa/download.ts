import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import http from 'http'
import https from 'https'
import { dirname } from 'path'

export type DownloadProgress = { received: number; total: number }

export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('http://') ? http.get : https.get
    const req = get(
      url,
      { headers: { 'User-Agent': 'Ackem-voice' }, timeout: 60_000 },
      (res) => {
        const loc = res.headers.location
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
          res.resume()
          const next = loc.startsWith('http') ? loc : new URL(loc, url).toString()
          downloadFile(next, dest, onProgress).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`下载失败 HTTP ${res.statusCode}`))
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        void mkdir(dirname(dest), { recursive: true }).then(() => {
          const out = createWriteStream(dest)
          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            onProgress?.({ received, total })
          })
          res.pipe(out)
          out.on('finish', () => out.close(() => resolve()))
          out.on('error', reject)
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('下载超时'))
    })
  })
}
