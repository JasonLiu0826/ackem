export interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  ENVIRONMENT: string
}

export interface SyncDevice {
  device_id: string
  device_name: string
  pair_code: string
  paired_at: number
  last_sync_ts: number
}

export interface ChatMessage {
  id: string
  session_id: string
  role: string
  content: string
  image_path?: string
  created_at: number
  device_id: string
  synced_at: number
}

export interface MemoryFact {
  id: string
  content: string
  confidence: number
  created_at: number
  updated_at: number
  device_id: string
}

export interface SyncChange {
  id: string
  table: string
  operation: 'insert' | 'update' | 'delete'
  data: Record<string, any>
  timestamp: number
  deviceId: string
}

export interface PullRequest {
  deviceId: string
  since: number
}

export interface PushRequest {
  deviceId: string
  changes: SyncChange[]
}

export interface PairRequest {
  pairCode: string
  deviceId: string
  deviceName: string
}
