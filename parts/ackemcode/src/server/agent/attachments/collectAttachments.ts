import type { HostAttachmentInput } from './types.js'
import type { Attachment } from './types.js'
import { extractAtPaths } from './parseAtMentions.js'
import { loadPathAsAttachment } from './loadPathBody.js'
import { finalizeAttachments } from './dedupeAndLimit.js'
import { FILE_CHAR_CAP, TURN_CHAR_CAP } from './types.js'
import type { ModelMediaCaps } from '../../llm/capabilities.js'

export type CollectTurnAttachmentsOpts = {
  userText: string
  cwd: string
  hostAttachments?: HostAttachmentInput[]
  mediaCaps?: ModelMediaCaps
}

/**
 * G-03 turn-start collector: @mentions + workbench chips/open paths.
 * Mid-turn sources (prefetch/lsp/post_compact) use textAttachment + format separately.
 */
export async function collectTurnStartAttachments(
  opts: CollectTurnAttachmentsOpts
): Promise<Attachment[]> {
  const raw: Attachment[] = []
  let charBudget = TURN_CHAR_CAP

  const host = opts.hostAttachments ?? []
  for (const h of host) {
    const source = h.source ?? 'workbench_chip'
    const loaded = await loadPathAsAttachment({
      relOrAbs: h.path,
      cwd: opts.cwd,
      source,
      kind: h.kind,
      charBudget,
      mediaCaps: opts.mediaCaps
    })
    if (!loaded) continue
    if (!loaded.omitted) charBudget -= Math.min(loaded.body.length, FILE_CHAR_CAP)
    raw.push(loaded)
  }

  for (const rel of extractAtPaths(opts.userText)) {
    const loaded = await loadPathAsAttachment({
      relOrAbs: rel,
      cwd: opts.cwd,
      source: 'at_mention',
      charBudget,
      mediaCaps: opts.mediaCaps
    })
    if (!loaded) continue
    if (!loaded.omitted) charBudget -= Math.min(loaded.body.length, FILE_CHAR_CAP)
    raw.push(loaded)
  }

  return finalizeAttachments(raw)
}
