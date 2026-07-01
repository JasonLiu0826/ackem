import type { AppSettings } from '../../../settings'
import type { PlanSession } from '../../../../shared/planSession'
import { resolvePlanArtifactKind } from '../../../../shared/planArtifact'
import type { GenerateStrategy } from '../../../../shared/openforuAgentTypes'
import type { ArtifactBundle } from './bundleTypes'
import { generateDeterministicBundleForKind } from './strategies/deterministic'
import { generateHybridBundle } from './strategies/hybrid'
import { generateLlmUpluginCodeBundle } from './strategies/llmUpluginCode'
import { isHybridStrategy, isLlmUpluginStrategy, resolveGenerateStrategy, type GenerateStrategySetting } from './strategies/resolveStrategy'

export async function generateArtifactBundle(
  session: PlanSession,
  settings: AppSettings,
  strategyInput?: GenerateStrategySetting,
  abortSignal?: AbortSignal
): Promise<{ bundle: ArtifactBundle; strategy: GenerateStrategy }> {
  if (abortSignal?.aborted) {
    throw new DOMException('操作已取消', 'AbortError')
  }
  const strategy = resolveGenerateStrategy(session, strategyInput)
  const kind = resolvePlanArtifactKind(session)
  if (kind !== 'uskill' && kind !== 'uplugin') {
    throw new Error('请先在 Plan 中明确产物类型为 uskill 或 uplugin')
  }

  if (strategy === 'deterministic') {
    const bundle = generateDeterministicBundleForKind(session, kind)
    bundle.generationLog.unshift('strategy: deterministic')
    return { bundle, strategy }
  }

  if (isHybridStrategy(strategy)) {
    const bundle = await generateHybridBundle(session, settings, kind, abortSignal)
    return { bundle, strategy }
  }

  if (isLlmUpluginStrategy(strategy)) {
    if (kind !== 'uplugin') {
      throw new Error('llm_uplugin_code 仅适用于 uplugin')
    }
    const bundle = await generateLlmUpluginCodeBundle(session, settings, abortSignal)
    return { bundle, strategy: 'llm_uplugin_code' }
  }

  // AC-2+ llm_manifest 等：暂回落 deterministic
  const bundle = generateDeterministicBundleForKind(session, kind)
  bundle.generationLog.unshift(`strategy: ${strategy} (fallback deterministic)`)
  return { bundle, strategy: 'deterministic' }
}
