import { ensureDefaultWorkDirectory } from '../ackemcode/workDirectory'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ChannelPlan } from '../../shared/channelPlan'

/** job 必须是用户确认的目录。factory 才可以用 openforu/staging，永不默认 data/ 根。 */
export function resolveWorkCwd(
  plan: ChannelPlan,
  dataRoot?: string
): { cwd?: string; error?: string } {
  if (plan.channel !== 'work') return {}

  if (plan.workKind === 'factory') {
    if (plan.cwd?.trim()) return { cwd: plan.cwd.trim() }
    if (!dataRoot) return { error: '缺少工作目录' }
    if (plan.intent === 'update' && plan.extensionId) {
      const slug = plan.extensionId.replace(/^.*\//, '').replace(/@.*$/, '')
      const candidates = [
        join(dataRoot, 'openforu', 'uplugins', slug),
        join(dataRoot, 'openforu', 'uskills', slug)
      ]
      const hit = candidates.find((p) => existsSync(p))
      if (hit) return { cwd: hit }
    }
    return { cwd: join(dataRoot, 'openforu', 'staging') }
  }

  const cwd = plan.cwd?.trim()
  if (cwd) {
    if (dataRoot && isAckemDataRoot(cwd, dataRoot)) {
      return { error: '不可默认 Ackem data/ 为工作目录' }
    }
    return { cwd }
  }
  // 用户没指定目录时给 Ackem 管理的默认工作区——
  // 不是 data/ 根（红线），而是专门的 workspace 子目录。
  if (dataRoot) {
    return { cwd: ensureDefaultWorkDirectory(dataRoot) }
  }
  return { error: '缺少工作目录且无 dataRoot 可解析默认工作区' }
}

function isAckemDataRoot(cwd: string, dataRoot: string): boolean {
  try {
    return resolve(cwd) === resolve(dataRoot)
  } catch {
    return false
  }
}
