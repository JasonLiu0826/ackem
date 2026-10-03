import {
  dryRunLegacyEvidenceBackfill,
  runLegacyEvidenceBackfillUntilDone,
  type LegacyBackfillDryRunReport,
  type LegacyBackfillResult
} from './legacyEvidenceBackfill.js'

export type LegacyMigrationRunResult = {
  dryRunReport: LegacyBackfillDryRunReport
  applied: LegacyBackfillResult | null
}

/** Production entry: always dry-run report first; apply only when `apply: true`. */
export function runLegacyEvidenceMigration(
  dataRoot: string,
  opts: { apply?: boolean; batchSize?: number; maxRounds?: number } = {}
): LegacyMigrationRunResult {
  const dryRunReport = dryRunLegacyEvidenceBackfill(dataRoot)
  if (!opts.apply) {
    return { dryRunReport, applied: null }
  }
  const applied = runLegacyEvidenceBackfillUntilDone(dataRoot, {
    batchSize: opts.batchSize ?? 50,
    maxRounds: opts.maxRounds ?? 200
  })
  return { dryRunReport, applied }
}
