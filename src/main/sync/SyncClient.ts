// Cloudflare Workers 同步客户端
// 使用 fetch API 调用 Workers 端点

const DEFAULT_WORKER_URL = 'https://britney-sync.YOUR_SUBDOMAIN.workers.dev'

export interface SyncChange {
  id: string
  table: string
  operation: 'insert' | 'update' | 'delete'
  data: Record<string, any>
  timestamp: number
  deviceId: string
}

interface PullResponse {
  ok: boolean
  changes: SyncChange[]
  serverTs: number
}

export class SyncClient {
  private workerUrl: string
  private deviceId: string

  constructor(workerUrl?: string, deviceId?: string) {
    this.workerUrl = workerUrl || DEFAULT_WORKER_URL
    this.deviceId = deviceId || 'pc'
  }

  async pull(since: number): Promise<SyncChange[]> {
    const resp = await fetch(`${this.workerUrl}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.deviceId, since })
    })

    if (!resp.ok) throw new Error(`Sync pull failed: ${resp.status}`)

    const data = (await resp.json()) as PullResponse
    return data.changes || []
  }

  async push(changes: SyncChange[]): Promise<void> {
    const resp = await fetch(`${this.workerUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.deviceId, changes })
    })

    if (!resp.ok) throw new Error(`Sync push failed: ${resp.status}`)
  }

  async pair(pairCode: string): Promise<{ ok: boolean; error?: string }> {
    const resp = await fetch(`${this.workerUrl}/api/sync/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairCode,
        deviceId: this.deviceId,
        deviceName: `PC-${process.env.COMPUTERNAME || 'Unknown'}`
      })
    })

    return resp.json() as Promise<{ ok: boolean; error?: string }>
  }

  async generatePairCode(): Promise<string> {
    const resp = await fetch(`${this.workerUrl}/api/sync/pair-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.deviceId })
    })

    const data = (await resp.json()) as { ok: boolean; code: string }
    if (!data.ok) throw new Error('Failed to generate pair code')
    return data.code
  }

  async uploadImage(imageId: string, buffer: Buffer, contentType: string): Promise<string> {
    const formData = new FormData()
    formData.append('file', new Blob([buffer], { type: contentType }), `${imageId}.png`)
    formData.append('imageId', imageId)

    const resp = await fetch(`${this.workerUrl}/api/image/upload`, {
      method: 'POST',
      body: formData
    })

    if (!resp.ok) throw new Error(`Image upload failed: ${resp.status}`)

    const data = (await resp.json()) as { ok: boolean; key: string }
    return data.key
  }

  async getImage(r2Key: string): Promise<Blob | null> {
    const resp = await fetch(`${this.workerUrl}/api/image/${r2Key}`)
    if (!resp.ok) return null
    return resp.blob()
  }
}
