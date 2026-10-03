export type PermanentDeletePreviewPayload = {
  targetKind: 'fact' | 'episode'
  targetId: string
  scope: 'memory_only' | 'memory_and_source'
  summary: string
}

export async function fetchVerifiedPermanentDeletePreview(
  preview: PermanentDeletePreviewPayload
): Promise<{
  previewOk: boolean
  verifiedSummary: string | null
  impactHint: string | null
  error: string | null
}> {
  const res = await window.ackem.memoryPermanentDeletePreview(preview)
  return {
    previewOk: Boolean(res.ok),
    verifiedSummary: res.verifiedSummary ?? null,
    impactHint: res.impactHint ?? null,
    error: res.ok ? null : res.error ?? 'target_not_found'
  }
}

export async function executeConfirmedPermanentDelete(
  preview: PermanentDeletePreviewPayload,
  verifiedSummary: string | null,
  displaySummary: string
): Promise<{ ok: boolean; error: string | null }> {
  const res = await window.ackem.memoryPermanentDelete(preview, null, true)
  if (!res.ok) {
    return { ok: false, error: res.errorCode ?? 'delete_failed' }
  }
  void verifiedSummary
  void displaySummary
  return { ok: true, error: null }
}
