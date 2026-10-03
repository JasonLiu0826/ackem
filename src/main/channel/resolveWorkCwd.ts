import { existsSync } from 'node:fs'
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
  if (!cwd) return { error: '缺少工作目录' }
  if (dataRoot && isAckemDataRoot(cwd, dataRoot)) {
    return { error: '不可默认 Ackem data/ 为工作目录' }
  }
  return { cwd }
}

function isAckemDataRoot(cwd: string, dataRoot: string): boolean {
  try {
    return resolve(cwd) === resolve(dataRoot)
  } catch {
    return false
  }
}
