import type { MemoryControlCommand, MemoryControlResult } from '../memory/contracts.js'
import {
  verifyPermanentDeleteTarget,
  type PermanentDeletePreview,
  type VerifiedPermanentDeletePreview
} from '../memory/audit/memoryAuditIpc.js'
import { invokeMemoryControl } from './memoryControlBridge.js'

function toControlCommand(
  verified: VerifiedPermanentDeletePreview,
  sessionId: string
): MemoryControlCommand | null {
  if (!verified.ok || !verified.targetId || !verified.targetKind) return null
  if (verified.targetKind === 'episode') {
    return {
      kind: 'delete',
      target: { kind: 'episode', episodeId: verified.targetId },
      scope: verified.scope,
      sessionId,
      timezone: 'Asia/Shanghai'
    }
  }
  return {
    kind: 'delete',
    target: { kind: 'fact', factId: verified.targetId },
    scope: verified.scope,
    sessionId,
    timezone: 'Asia/Shanghai'
  }
}

export async function executePermanentDeleteWithReport(
  dataRoot: string,
  sessionId: string,
  preview: PermanentDeletePreview,
  turnId: string | null | undefined,
  opts: { confirmed?: boolean } = {}
): Promise<
  Omit<MemoryControlResult, 'errorCode'> & {
    impactHint: string
    preview?: VerifiedPermanentDeletePreview
    errorCode?: string
  }
> {
  const verified = verifyPermanentDeleteTarget(dataRoot, preview)
  if (!verified.ok) {
    return {
      ok: false,
      invalidated: { facts: 0, episodes: 0, embeddings: 0, associations: 0 },
      impactHint: verified.impactHint,
      preview: verified,
      errorCode: verified.error
    }
  }
  if (!opts.confirmed) {
    return {
      ok: false,
      invalidated: { facts: 0, episodes: 0, embeddings: 0, associations: 0 },
      impactHint: verified.impactHint,
      preview: verified,
      errorCode: 'confirmation_required'
    }
  }
  const command = toControlCommand(verified, sessionId)
  if (!command) {
    return {
      ok: false,
      invalidated: { facts: 0, episodes: 0, embeddings: 0, associations: 0 },
      impactHint: verified.impactHint,
      preview: verified,
      errorCode: 'invalid_target'
    }
  }
  const result = await invokeMemoryControl(dataRoot, {
    ...command,
    turnId: turnId ?? null
  })
  return {
    ...result,
    impactHint: verified.impactHint,
    preview: verified
  }
}
