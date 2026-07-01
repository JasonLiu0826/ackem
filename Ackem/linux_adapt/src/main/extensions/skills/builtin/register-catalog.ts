// 注册规划中 Skill 占位 manifest（无 handler，status=planned）

import type { SkillRegistry } from '../../registry'
import { normalizePlannedCatalogManifest } from '../../placeholderManifest'
import { MANIFEST as petInteraction } from './system_event/pet-interaction/manifest'
import { MANIFEST as sharedExperience } from './engine_event/shared-experience/manifest'
import { MANIFEST as backupMigrate } from './manual/backup-migrate/manifest'

const PLACEHOLDER_SKILL_MANIFESTS_RAW = [
  petInteraction,
  sharedExperience,
  backupMigrate
] as const

export const CATALOG_PLANNED_SKILL_MANIFESTS = PLACEHOLDER_SKILL_MANIFESTS_RAW.map((m) =>
  normalizePlannedCatalogManifest(m)
)

export const CATALOG_PLANNED_SKILL_IDS = CATALOG_PLANNED_SKILL_MANIFESTS.map((m) => m.id)

/** 与 register-placeholders.PLACEHOLDER_SKILL_IDS 同源（FIX-031） */
export const PLACEHOLDER_SKILL_IDS = CATALOG_PLANNED_SKILL_IDS

/** 将 CATALOG 占位 Skill 登记为 planned（已实装 handler 的 id 会自动跳过） */
export async function registerSkillCatalogPlaceholders(registry: SkillRegistry): Promise<void> {
  for (const manifest of CATALOG_PLANNED_SKILL_MANIFESTS) {
    await registry.registerPlaceholder(manifest)
    registry.enforceCatalogPlanned(manifest.id, manifest)
  }
}
