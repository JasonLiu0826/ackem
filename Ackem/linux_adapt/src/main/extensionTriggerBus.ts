import type { DispatchTriggerStatus } from '../shared/dispatchTrigger'
import type { SkillTrigger } from './extensions/skills/types'
import { getExtensionsCoordinator } from './extensions/runtime'
import { broadcastToRenderers } from './rendererBroadcast'

/** 后台定时任务等不应刷聊天侧栏 */
const SILENT_SKILL_TRIGGERS = new Set<SkillTrigger>(['scheduled'])

let turnLatest: DispatchTriggerStatus | null = null

export function clearExtensionTriggerTurn(): void {
  turnLatest = null
}

export function consumeExtensionTriggerTurn(): DispatchTriggerStatus | undefined {
  const value = turnLatest ?? undefined
  turnLatest = null
  return value
}

export function resolveExtensionTriggerFromId(extensionId: string): DispatchTriggerStatus {
  const coordinator = getExtensionsCoordinator()
  const skill = coordinator?.skills.get(extensionId)
  if (skill) {
    return {
      extensionId,
      extensionName: skill.manifest.name,
      kind: 'skill'
    }
  }
  const plugin = coordinator?.plugins.get(extensionId)
  if (plugin) {
    return {
      extensionId,
      extensionName: plugin.manifest.name,
      kind: 'plugin'
    }
  }
  return { extensionId, extensionName: extensionId, kind: 'plugin' }
}

export function publishExtensionTriggered(status: DispatchTriggerStatus): void {
  turnLatest = status
  broadcastToRenderers('chat:extensionTrigger', status)
}

export function publishExtensionTriggeredById(extensionId: string): void {
  publishExtensionTriggered(resolveExtensionTriggerFromId(extensionId))
}

export function publishSkillExecutionTriggered(
  invocation: { trigger: SkillTrigger },
  manifest: { id: string; name: string }
): void {
  if (SILENT_SKILL_TRIGGERS.has(invocation.trigger)) return
  publishExtensionTriggered({
    extensionId: manifest.id,
    extensionName: manifest.name,
    kind: 'skill'
  })
}
