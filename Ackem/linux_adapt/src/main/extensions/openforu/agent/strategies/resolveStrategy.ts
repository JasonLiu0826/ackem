import type { PlanSession } from '../../../../../shared/planSession'
import { resolvePlanArtifactKind } from '../../../../../shared/planArtifact'
import type { GenerateStrategy } from '../../../../../shared/openforuAgentTypes'

export type GenerateStrategySetting = GenerateStrategy | 'auto' | undefined

/** D1：auto → uskill=hybrid_skill · uplugin Surface Widget=deterministic · 其余 llm_uplugin_code */
export function resolveGenerateStrategy(
  session: PlanSession,
  setting?: GenerateStrategySetting
): GenerateStrategy {
  if (setting && setting !== 'auto') {
    return setting
  }
  const kind = resolvePlanArtifactKind(session)
  if (kind === 'uplugin') {
    const ui = session.designSpec?.ui
    if (ui?.type === 'surface' && ui.widgetId) {
      return 'deterministic'
    }
    return 'llm_uplugin_code'
  }
  if (kind === 'uskill') return 'hybrid_skill'
  return 'deterministic'
}

export function isHybridStrategy(strategy: GenerateStrategy): boolean {
  return strategy === 'hybrid_skill' || strategy === 'hybrid_inject'
}

export function isLlmUpluginStrategy(strategy: GenerateStrategy): boolean {
  return strategy === 'llm_uplugin_code'
}
