/**
 * FIX-031 — CATALOG 占位 manifest 统一标注（扩展中心「规划中」灰显）
 */
import type { ExtensionManifestBase } from './protocols'

export const PLANNED_CATALOG_TAG = 'catalog-planned'
export const PLANNED_DESCRIPTION_PREFIX = '【规划中 · 尚未实装】'

export type PlannedImplementationStatus = 'planned'

/** 为 register-catalog 占位项补齐诚实描述与 implementationStatus */
export function normalizePlannedCatalogManifest<T extends ExtensionManifestBase>(manifest: T): T {
  const desc = manifest.description?.trim() ?? ''
  const hasHonestPrefix =
    desc.includes('规划中') || desc.includes('尚未实装') || desc.startsWith('【规划')
  const tags = [...new Set([...(manifest.tags ?? []), 'placeholder', PLANNED_CATALOG_TAG])]
  return {
    ...manifest,
    implementationStatus: 'planned',
    description: hasHonestPrefix ? desc : `${PLANNED_DESCRIPTION_PREFIX} ${desc}`,
    tags
  }
}

export function isCatalogPlannedManifest(manifest: ExtensionManifestBase): boolean {
  return (
    manifest.implementationStatus === 'planned' ||
    (manifest.tags?.includes(PLANNED_CATALOG_TAG) ?? false)
  )
}

export const DEPRECATED_CATALOG_TAG = 'catalog-deprecated'
export const DEPRECATED_DESCRIPTION_PREFIX = '【已下线 · 2026-06-06】'

export type DeprecatedImplementationStatus = 'deprecated'

/** FIX-032 — 已砍扩展：CATALOG 标注 deprecated，扩展中心「已下线」灰显 */
export function normalizeDeprecatedCatalogManifest<T extends ExtensionManifestBase>(manifest: T): T {
  const desc = manifest.description?.trim() ?? ''
  const hasHonestPrefix =
    desc.includes('已下线') || desc.includes('deprecated') || desc.startsWith('【已下线')
  const tags = [...new Set([...(manifest.tags ?? []), 'deprecated', DEPRECATED_CATALOG_TAG])]
  return {
    ...manifest,
    implementationStatus: 'deprecated',
    description: hasHonestPrefix ? desc : `${DEPRECATED_DESCRIPTION_PREFIX} ${desc}`,
    tags
  }
}

export function isCatalogDeprecatedManifest(manifest: ExtensionManifestBase): boolean {
  return (
    manifest.implementationStatus === 'deprecated' ||
    (manifest.tags?.includes(DEPRECATED_CATALOG_TAG) ?? false)
  )
}
