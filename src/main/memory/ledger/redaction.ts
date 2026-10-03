/** Canonical payload fingerprint after permanent redaction (plan §7.1). */
export const REDACTED_CONTENT_HASH = 'redacted'
export const REDACTED_SUMMARY = '[redacted]'
export const REDACTED_CONTENT_JSON = '{}'

export function isRedactedPayload(contentHash: string, redactedAt: string | null): boolean {
  return redactedAt != null || contentHash === REDACTED_CONTENT_HASH
}
