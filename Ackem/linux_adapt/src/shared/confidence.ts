/** Normalize raw/LLM confidence to 0–1. Handles 0–10 and 0–100 scales. */
export function normalizeConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0.7
  let v = raw
  if (v > 1 && v <= 10) v = v / 10
  else if (v > 10 && v <= 100) v = v / 100
  return Math.max(0, Math.min(1, v))
}

export function formatConfidencePercent(confidence: number): string {
  return `${Math.round(normalizeConfidence(confidence) * 100)}%`
}
