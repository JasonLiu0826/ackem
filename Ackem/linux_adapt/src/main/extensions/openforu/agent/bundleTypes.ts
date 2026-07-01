import type { SkillManifest } from '../../skills/types'
import type { PluginManifest } from '../../plugins/types'
import type { UskilConfig, UpluginMeta } from '../loader'

export type UskillArtifactBundle = {
  kind: 'uskill'
  manifest: SkillManifest
  skillConfig: UskilConfig
  dirName: string
  files: Record<string, string>
  generationLog: string[]
  suggestedPermissions: string[]
  permissionReasons: Record<string, string>
}

export type UpluginArtifactBundle = {
  kind: 'uplugin'
  manifest: PluginManifest
  meta: UpluginMeta
  dirName: string
  files: Record<string, string>
  generationLog: string[]
}

export type ArtifactBundle = UskillArtifactBundle | UpluginArtifactBundle

export const GENERATED_BY_AC1 = 'openforu-agent-core-ac1'
