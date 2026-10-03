export const LEGACY_IMPORT_CONFIDENCE_CAP = 0.4

export function capLegacyConfidence(raw: number | undefined): number {
  const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : LEGACY_IMPORT_CONFIDENCE_CAP
  return Math.min(v, LEGACY_IMPORT_CONFIDENCE_CAP)
}
