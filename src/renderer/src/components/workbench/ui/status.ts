import type { CoarseStatus } from '../../../store/workbenchStore'

export const STATUS_WORD: Record<CoarseStatus, string> = {
  draft: '草稿',
  running: '干活中',
  waiting: '等你批',
  paused: '已停止',
  done: '做完了',
  failed: '失败',
  unknown: '待核对'
}

export function statusLabel(status: CoarseStatus): string {
  return STATUS_WORD[status]
}
