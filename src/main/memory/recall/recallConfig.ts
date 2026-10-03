/** Chat recall seam rollback: off | shadow (legacy-only tierB, composer traced) | on (merge composer block). */
export type RecallComposerMode = 'off' | 'shadow' | 'on'

export function resolveRecallComposerMode(env: NodeJS.ProcessEnv = process.env): RecallComposerMode {
  const raw = (env.ACKEM_RECALL_COMPOSER_MODE ?? 'shadow').trim().toLowerCase()
  if (raw === 'off' || raw === '0' || raw === 'false') return 'off'
  if (raw === 'shadow') return 'shadow'
  return 'on'
}
