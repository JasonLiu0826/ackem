import type { SkillRegistry } from '../../../registry'
import { EMERGENCY_COMPANION_MANIFEST } from './manifest'
import { emergencyCompanionSkill } from './skill'

export async function registerBuiltinEmergencyCompanion(registry: SkillRegistry): Promise<void> {
  if (registry.get('Ackem/emergency-companion@0.0.1')) {
    await registry.unregister('Ackem/emergency-companion@0.0.1')
  }

  const reg = await registry.register(emergencyCompanionSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '搴旀€ラ櫔浼?Skill 娉ㄥ唽澶辫触')
  }

  const instance = registry.get(EMERGENCY_COMPANION_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(EMERGENCY_COMPANION_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? '搴旀€ラ櫔浼?Skill 婵€娲诲け璐?)
  }
}
