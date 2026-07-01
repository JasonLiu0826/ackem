import { getExtensionsCoordinator } from '../../../runtime'
import { buildEngineSnapshot } from '../../../snapshot'
import { loadSettings } from '../../../../settings'
import { loadState, defaultFullState } from '../../../../engine/state-persistence'
import { defaultPersonalitySlice } from '../../../../personalityPresets'
import { OFFLINE_THOUGHT_MANIFEST } from './manifest'
import { runOfflineThoughtGeneration } from './skill'

/** 应用退出时：Skill 已启用则走 Registry，否则跳过 */
export async function runOfflineThoughtOnExit(dataRoot: string, sessionId: string): Promise<number> {
  const coordinator = getExtensionsCoordinator()
  const inst = coordinator?.skills.get(OFFLINE_THOUGHT_MANIFEST.id)
  if (!inst || inst.status !== 'active') return 0

  const settings = loadSettings()
  const state =
    loadState(dataRoot, sessionId) ?? defaultFullState(defaultPersonalitySlice(settings))
  const snapshot = buildEngineSnapshot(state, settings)

  if (coordinator) {
    const result = await coordinator.executeSkill({
      invocationId: `offline-exit-${Date.now()}`,
      skillId: OFFLINE_THOUGHT_MANIFEST.id,
      trigger: 'engine_event',
      triggerDetail: 'app_quit',
      snapshot
    })
    return typeof result.data === 'object' && result.data && 'count' in result.data
      ? Number((result.data as { count: number }).count)
      : 0
  }

  return runOfflineThoughtGeneration({ dataRoot, sessionId, snapshot })
}
