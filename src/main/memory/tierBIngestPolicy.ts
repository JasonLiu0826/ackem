import { detectMemoryIntent } from '../engine/interpreter'
import { extractFactDrafts, hasUserFamilyLightHits } from './lightExtract'

/**
 * CANON-M-3锛氶粯璁ゅ湪鐢ㄦ埛闂?Ackem 鍒涢€犺€呮椂 skip Tier B ingest銆?
 * 鏄惧紡 remember銆乽ser_family 鎸囩О銆佹垨杞婚噺瀹跺涵/鐢熸棩瑙勫垯鍛戒腑鏃?**涓?skip**銆?
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
