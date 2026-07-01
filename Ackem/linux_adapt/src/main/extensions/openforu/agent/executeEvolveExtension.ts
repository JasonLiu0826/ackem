import type { ExtensionsCoordinator } from '../../coordinator'
import type { AppSettings } from '../../../settings'
import { applyRefine, previewRefine, getRefineHistory, rollbackRefine } from '../refine/refinePipeline'

export type EvolveExtensionResult = {
  ok: boolean
  extensionId: string
  message: string
  diffPreview?: string
  newExtensionId?: string
}

/** Refine 轨：Evolve → validate → redeploy → verify → 一条交付卡 */
export async function executeEvolveExtension(
  coordinator: ExtensionsCoordinator,
  extensionId: string,
  instruction: string,
  settings: AppSettings
): Promise<EvolveExtensionResult> {
  const dataRoot = coordinator.getDataRoot()
  const result = await applyRefine(coordinator, extensionId, instruction, settings, dataRoot)
  return {
    ok: result.ok,
    extensionId: result.extensionId,
    newExtensionId: result.newExtensionId,
    message: result.message,
    diffPreview: result.diffPreview
  }
}

export { previewRefine, getRefineHistory, rollbackRefine }
