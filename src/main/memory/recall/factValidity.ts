import type { RecallQuery } from '../contracts.js'
import { zonedLocalDate } from '../temporal/zonedDate.js'

const LOCAL_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function parseInstantMs(iso: string): number | null {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * memory_facts.valid_from / valid_to interpretation (Task 12, not Task 13 forget):
 *
 * 1) `YYYY-MM-DD` — inclusive civil calendar day in `query.timezone`.
 *    valid_to = last local day the fact is true (query local date must be <= valid_to).
 *
 * 2) Full ISO-8601 instant — compared via Date.parse (actual timeline instant);
 *    `Z` and numeric offsets (e.g. `+08:00`) are equivalent when they denote the same instant.
 */
export function factValidityAt(
  query: RecallQuery,
  validFrom: string | null | undefined,
  validTo: string | null | undefined
): 'ok' | 'fact_not_yet_valid' | 'fact_valid_to_expired' {
  const at = query.observedAt
  const tz = query.timezone
  const queryMs = parseInstantMs(at)

  if (validFrom) {
    if (LOCAL_DATE_ONLY.test(validFrom)) {
      const qDay = zonedLocalDate(new Date(at), tz)
      if (qDay < validFrom) return 'fact_not_yet_valid'
    } else if (queryMs != null) {
      const fromMs = parseInstantMs(validFrom)
      if (fromMs != null && queryMs < fromMs) return 'fact_not_yet_valid'
    }
  }

  if (validTo) {
    if (LOCAL_DATE_ONLY.test(validTo)) {
      const qDay = zonedLocalDate(new Date(at), tz)
      if (qDay > validTo) return 'fact_valid_to_expired'
    } else if (queryMs != null) {
      const toMs = parseInstantMs(validTo)
      if (toMs != null && queryMs > toMs) return 'fact_valid_to_expired'
    }
  }

  return 'ok'
}
