import { detectMemoryIntent } from '../engine/interpreter'
import { extractFactDrafts, hasUserFamilyLightHits } from './lightExtract'

/**
 * CANON-M-3：默认在用户问 Ackem 创造者时 skip Tier B ingest。
 * 显式 remember、user_family 指称、或轻量家庭/生日规则命中时 **不 skip**。
 */
export function resolveTierBIngestSkip(args: {
  skipIngest: boolean
  userMsg: string
  trace: { l3?: { originFatherRef?: string | null } }
}): boolean {
  if (!args.skipIngest) return false

  if (detectMemoryIntent(args.userMsg) === 'remember') return false
  if (args.trace.l3?.originFatherRef === 'user_family') return false
  if (hasUserFamilyLightHits(args.userMsg)) return false

  return true
}
