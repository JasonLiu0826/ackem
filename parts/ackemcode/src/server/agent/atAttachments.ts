/**
 * @deprecated Prefer `./attachments/` — thin wrappers for legacy call sites.
 */
import {
  collectTurnStartAttachments,
  formatAttachmentsForModel,
  type Attachment
} from './attachments/index.js'

export type AtAttachment = Attachment

export { extractAtPaths } from './attachments/parseAtMentions.js'

export async function collectAtAttachments(
  text: string,
  cwd: string
): Promise<AtAttachment[]> {
  return collectTurnStartAttachments({ userText: text, cwd })
}

export function formatAtAttachmentsForModel(atts: AtAttachment[]): string {
  return formatAttachmentsForModel(atts)
}
