import type { PlanSession } from '../../../../../shared/planSession'
import { generateUpluginBundle, generateUskillBundle } from '../../agentPipeline'
import type { ArtifactBundle, UpluginArtifactBundle, UskillArtifactBundle } from '../bundleTypes'

/** 按产物类型生成（避免 uskill/uplugin 互斥抛错） */
export function generateDeterministicBundleForKind(
  session: PlanSession,
  kind: 'uskill' | 'uplugin'
): ArtifactBundle {
  if (kind === 'uplugin') {
    const uplugin = generateUpluginBundle(session)
    return {
      kind: 'uplugin',
      manifest: uplugin.manifest,
      meta: uplugin.meta,
      dirName: uplugin.dirName,
      files: { ...uplugin.files },
      generationLog: [...uplugin.generationLog]
    }
  }
  const uskill = generateUskillBundle(session)
  return {
    kind: 'uskill',
    manifest: uskill.manifest,
    skillConfig: uskill.skillConfig,
    dirName: uskill.dirName,
    files: { ...uskill.files },
    generationLog: [...uskill.generationLog],
    suggestedPermissions: uskill.suggestedPermissions,
    permissionReasons: uskill.permissionReasons
  }
}
