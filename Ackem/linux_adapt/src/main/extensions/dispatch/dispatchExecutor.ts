import { randomUUID } from 'node:crypto'
import type { EngineSnapshot, ExtensionEvent } from '../protocols'
import type { ExtensionsCoordinator } from '../coordinator'
import type { SkillResult } from '../skills/types'
import { recordDispatchTrigger } from './dispatchSession'
import { publishExtensionTriggeredById } from '../../extensionTriggerBus'
import { notifyExtensionInvoke } from '../extensionInvokeToast'

function resolveSkillContextInjection(result: SkillResult): string | undefined {
  const fromEvent = result.events.find(
    (e) => e.injectToContext && e.contextInjection?.trim()
  )?.contextInjection?.trim()
  if (fromEvent) return fromEvent
  if (result.injectToContext && result.output?.trim()) return result.output.trim()
  return undefined
}

export type DispatchExecutionResult = {
  contextInjection?: string
  emotionHint?: {
    affDelta?: number
    secDelta?: number
    aroDelta?: number
    domDelta?: number
  }
  events: ExtensionEvent[]
}

/** 运行面：catalog 非 active 时当作不存在（EXTENSION_AVAILABILITY_POLICY §5） */
export function isDispatchExtensionActive(
  coordinator: ExtensionsCoordinator,
  extensionId: string
): boolean {
  const entry = coordinator.getDispatchCatalog().find((e) => e.id === extensionId)
  return entry?.status === 'active'
}

/** 调度确认后执行扩展（Skill 或 Plugin beforeUserMessage） */
export async function executeDispatchedExtension(
  coordinator: ExtensionsCoordinator,
  extensionId: string,
  userMessage: string,
  sessionId: string,
  snapshot: EngineSnapshot
): Promise<DispatchExecutionResult> {
  if (!isDispatchExtensionActive(coordinator, extensionId)) {
    return { events: [] }
  }

  recordDispatchTrigger(sessionId, extensionId)

  const skillHandler = coordinator.getSkillHandler(extensionId)
  if (skillHandler) {
    const result = await coordinator.skills.execute({
      invocationId: randomUUID(),
      skillId: extensionId,
      trigger: 'keyword',
      triggerDetail: 'dispatch:auto_invoke',
      userMessage,
      snapshot
    })
    const events = result.events ?? []
    const contextInjection = resolveSkillContextInjection(result)
    if (result.ok) {
      const entry = coordinator.getDispatchCatalog().find((e) => e.id === extensionId)
      notifyExtensionInvoke(extensionId, entry?.name ?? extensionId)
    }
    if (contextInjection) {
      return { contextInjection, events }
    }
    return { events }
  }

  const pluginHooks = coordinator.plugins.get(extensionId)?.hooks
  if (pluginHooks?.beforeUserMessage) {
    try {
      const hook = await pluginHooks.beforeUserMessage(userMessage, snapshot)
      const injections = hook.contextInjections?.filter(Boolean) ?? []
      publishExtensionTriggeredById(extensionId)
      const entry = coordinator.getDispatchCatalog().find((e) => e.id === extensionId)
      notifyExtensionInvoke(extensionId, entry?.name ?? extensionId)
      return {
        contextInjection: injections.length > 0 ? injections.join('\n\n') : undefined,
        events: []
      }
    } catch (err) {
      const uplugin = coordinator.openforu.getUplugin(extensionId)
      const fallback = uplugin?.meta?.injectTemplate?.trim()
      if (fallback) {
        return { contextInjection: fallback, events: [] }
      }
      throw err
    }
  }

  const upluginOnly = coordinator.openforu.getUplugin(extensionId)
  const metaInject = upluginOnly?.meta?.injectTemplate?.trim()
  if (metaInject) {
    publishExtensionTriggeredById(extensionId)
    return { contextInjection: metaInject, events: [] }
  }

  return { events: [] }
}

/** llm_function_call 类扩展不在此执行，由 LLM tools 承接 */
export function shouldExecuteImmediately(
  coordinator: ExtensionsCoordinator,
  extensionId: string
): boolean {
  if (!isDispatchExtensionActive(coordinator, extensionId)) return false
  const entry = coordinator.getDispatchCatalog().find((e) => e.id === extensionId)
  if (!entry) return false
  if (entry.dispatch.subtype === 'llm_function_call') return false
  if (coordinator.getSkillHandler(extensionId)) return true
  const plugin = coordinator.plugins.get(extensionId)
  return Boolean(plugin?.hooks?.beforeUserMessage && plugin.status === 'active')
}
