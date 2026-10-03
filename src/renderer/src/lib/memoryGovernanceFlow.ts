export type PermanentDeletePreviewInput = {
  targetKind: 'fact' | 'episode'
  targetId: string
  scope: 'memory_only' | 'memory_and_source'
  summary: string
}

export type VerifiedDeletePreview = {
  ok: boolean
  error?: string
  verifiedSummary?: string
  impactHint?: string
}

/** UI gate: never call permanent delete without explicit user confirmation. */
export function canExecutePermanentDelete(confirmed: boolean, previewOk: boolean): boolean {
  return confirmed && previewOk
}

export function permanentDeleteBlockedReason(
  preview: VerifiedDeletePreview | null,
  confirmed: boolean
): string | null {
  if (!preview?.ok) return preview?.error ?? 'target_not_verified'
  if (!confirmed) return 'confirmation_required'
  return null
}
