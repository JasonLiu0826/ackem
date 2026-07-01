import type { AppSettings } from '../../../settings'
import type { PlanSession } from '../../../../shared/planSession'
import { resolvePlanArtifactKind } from '../../../../shared/planArtifact'
import { isOpenForUAgentCoreEnabled } from '../../../../shared/openforuConfig'
import { generateUpluginBundle, generateUskillBundle } from '../agentPipeline'
import type { ArtifactBundle } from './bundleTypes'
import { generateArtifactBundle } from './generateAgent'
import { hasStagingPreview, readStagingPreview, stagingPreviewDirRel } from './stagingIO'

export type ArtifactPreviewSource = 'preview' | 'staging'

export type ArtifactPreviewOk = {
  ok: true
  extensionId: string
  artifactKind: 'uskill' | 'uplugin'
  uskillId?: string
  dirRel: string
  files: Record<string, string>
  source: ArtifactPreviewSource
}

function bundleToPreview(bundle: ArtifactBundle, source: ArtifactPreviewSource): ArtifactPreviewOk {
  if (bundle.kind === 'uplugin') {
    return {
      ok: true,
      extensionId: bundle.manifest.id,
      artifactKind: 'uplugin',
      dirRel: `openforu/uplugins/${bundle.dirName}`,
      files: {
        'manifest.json': bundle.files['manifest.json'],
        'plugin.meta.json': bundle.files['plugin.meta.json']
      },
      source
    }
  }
  return {
    ok: true,
    extensionId: bundle.manifest.id,
    artifactKind: 'uskill',
    uskillId: bundle.manifest.id,
    dirRel: `openforu/uskills/${bundle.dirName}`,
    files: {
      'manifest.json': bundle.files['manifest.json'],
      'skill.json': bundle.files['skill.json']
    },
    source
  }
}

function stagingToPreview(
  sessionId: string,
  files: Record<string, string>,
  kind: 'uskill' | 'uplugin'
): ArtifactPreviewOk {
  const manifest = JSON.parse(files['manifest.json'] ?? '{}') as { id?: string }
  const extensionId = manifest.id ?? 'unknown'
  const dirRel = stagingPreviewDirRel(sessionId)
  if (kind === 'uplugin') {
    return {
      ok: true,
      extensionId,
      artifactKind: 'uplugin',
      dirRel,
      files: {
        'manifest.json': files['manifest.json'],
        'plugin.meta.json': files['plugin.meta.json'] ?? '{}'
      },
      source: 'staging'
    }
  }
  return {
    ok: true,
    extensionId,
    artifactKind: 'uskill',
    uskillId: extensionId,
    dirRel,
    files: {
      'manifest.json': files['manifest.json'],
      'skill.json': files['skill.json'] ?? '{}'
    },
    source: 'staging'
  }
}

/** AC-1：staging（部署前写入）优先，否则与 deploy 同路径 generate */
export async function previewPlanArtifact(
  dataRoot: string,
  session: PlanSession,
  settings: AppSettings
): Promise<ArtifactPreviewOk> {
  const kind = resolvePlanArtifactKind(session)
  if (kind !== 'uskill' && kind !== 'uplugin') {
    throw new Error('请先在 Plan 中明确产物类型为 uskill 或 uplugin')
  }

  if (isOpenForUAgentCoreEnabled(settings)) {
    if (hasStagingPreview(dataRoot, session.id)) {
      const stagingFiles = readStagingPreview(dataRoot, session.id)
      if (stagingFiles?.['manifest.json']) {
        return stagingToPreview(session.id, stagingFiles, kind)
      }
    }
    const { bundle } = await generateArtifactBundle(
      session,
      settings,
      settings.openforuGenerateStrategy ?? 'auto'
    )
    return bundleToPreview(bundle, 'preview')
  }

  if (kind === 'uplugin') {
    const bundle = generateUpluginBundle(session)
    return {
      ok: true,
      extensionId: bundle.manifest.id,
      artifactKind: 'uplugin',
      dirRel: `openforu/uplugins/${bundle.dirName}`,
      files: {
        'manifest.json': bundle.files['manifest.json'],
        'plugin.meta.json': bundle.files['plugin.meta.json']
      },
      source: 'preview'
    }
  }
  const bundle = generateUskillBundle(session)
  return {
    ok: true,
    extensionId: bundle.manifest.id,
    artifactKind: 'uskill',
    uskillId: bundle.manifest.id,
    dirRel: `openforu/uskills/${bundle.dirName}`,
    files: {
      'manifest.json': JSON.stringify(bundle.manifest, null, 2),
      'skill.json': JSON.stringify(bundle.skillConfig, null, 2)
    },
    source: 'preview'
  }
}
