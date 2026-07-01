/** 本机地图（MachineMap）— 电脑助手专用索引 */

export type MachineMapEntryCategory = 'game' | 'document' | 'app'

export type MachineMapScanStatus = 'idle' | 'running' | 'complete' | 'error'

export type MachineMapProgressPayload = {
  status: MachineMapScanStatus
  done: number
  total: number
  label: string
  scanRunId?: string
  gameCount?: number
  documentCount?: number
  error?: string
}

export type MachineMapStatus = {
  status: MachineMapScanStatus
  lastCompleteAt: string | null
  gameCount: number
  documentCount: number
  lastScanRunId: string | null
  isStale: boolean
}

export const MACHINE_MAP_STALE_MS = 24 * 60 * 60 * 1000

export function isMachineMapStale(lastCompleteAt: string | null, now = Date.now()): boolean {
  if (!lastCompleteAt) return true
  const t = Date.parse(lastCompleteAt)
  if (Number.isNaN(t)) return true
  return now - t > MACHINE_MAP_STALE_MS
}
