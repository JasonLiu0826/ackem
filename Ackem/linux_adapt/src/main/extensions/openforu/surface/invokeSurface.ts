import type { ExtensionsCoordinator } from '../../coordinator'
import type { EngineSnapshot } from '../../protocols'
import type { SurfaceInvokeDispatchMeta } from '../../../shared/extensionSurface'
import { executeDispatchedExtension } from '../../dispatch/dispatchExecutor'
import { executeOpenExtensionSurface } from './executeOpenSurface'
import { readUpluginSurfaceConfig } from './surfaceMeta'
import {
  SURFACE_OPENED_LLM_HINT,
  SURFACE_SLASH_LLM_HINT,
  buildSurfaceInvokeMeta
} from '../../../../shared/surfaceInvoke'

export type SurfaceInvokeOutcome = {
  opened: boolean
  message: string
  injectContext?: string
  llmHints: string[]
}

/** OFU-Surface：开窗口 + 可选 inject */
export async function executeSurfaceInvoke(input: {
  coordinator: ExtensionsCoordinator
  extensionId: string
  userMessage: string
  sessionId: string
  snapshot: EngineSnapshot
  invoke: SurfaceInvokeDispatchMeta
  reasoning?: string
}): Promise<SurfaceInvokeOutcome> {
  const hints: string[] = [SURFACE_OPENED_LLM_HINT]
  if (input.reasoning === 'extension_invoke_slash_surface') {
    hints.push(SURFACE_SLASH_LLM_HINT)
  }

  const open = executeOpenExtensionSurface(input.coordinator, input.extensionId)
  if (!open.ok) {
    return { opened: false, message: open.message, llmHints: hints }
  }

  let injectContext: string | undefined
  if (input.invoke.mode === 'open_and_inject') {
    const exec = await executeDispatchedExtension(
      input.coordinator,
      input.extensionId,
      input.userMessage,
      input.sessionId,
      input.snapshot
    )
    injectContext = exec.contextInjection
  }

  return {
    opened: true,
    message: open.message,
    injectContext,
    llmHints: hints
  }
}

export function readSurfaceInvokeMetaForExtension(
  coordinator: ExtensionsCoordinator,
  extensionId: string,
  trigger: 'slash' | 'keyword'
): SurfaceInvokeDispatchMeta | null {
  const surface = readUpluginSurfaceConfig(coordinator.getDataRoot(), extensionId)
  if (!surface) return null
  return buildSurfaceInvokeMeta(surface, trigger) ?? null
}
