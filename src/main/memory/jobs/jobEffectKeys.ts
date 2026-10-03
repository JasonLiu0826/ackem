/** Single idempotency marker per source + job_type + derivation_version (Task 9). */
export const JOB_EFFECT_APPLIED = 'applied'

export type PrefetchedFactKeyInput = {
  domain: string
  subcategory: string
  subject: string
}

/** Per-fact idempotency within one derive.chat_turn job. */
export function factEffectKey(fact: PrefetchedFactKeyInput): string {
  return `fact:${fact.domain}|${fact.subcategory}|${fact.subject}`
}
