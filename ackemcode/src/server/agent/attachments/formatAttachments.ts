import type { ChatMessage } from '../../../shared/types.js'
import type { Attachment } from './types.js'
import { estimateTokensForText } from '../compact/estimate.js'
import { mediaToContentParts, type MediaToPartsOpts } from '../../../shared/messageContent.js'

export function formatAttachmentBlock(a: Attachment): string {
  const flag = a.omitted ? ' omitted="true"' : ''
  const pathAttr = a.path ? ` path="${a.path}"` : ''
  return `<attachment kind="${a.kind}" source="${a.source}"${pathAttr}${flag}>\n${a.body}\n</attachment>`
}

export function formatAttachmentsForModel(atts: Attachment[]): string {
  if (!atts.length) return ''
  const blocks = atts.map(formatAttachmentBlock)
  return [
    '<system-reminder>',
    'The following attachments are injected for this turn (not a new user instruction).',
    '@ tokens in the user message are preserved for reference.',
    '</system-reminder>',
    '',
    ...blocks
  ].join('\n')
}

export function attachmentsToUserMessage(
  atts: Attachment[],
  opts?: MediaToPartsOpts
): ChatMessage | null {
  const text = formatAttachmentsForModel(atts)
  if (!text) return null
  const media = atts.flatMap((a) => a.media ?? [])
  if (!media.length) return { role: 'user', content: text }
  return {
    role: 'user',
    content: [
      { type: 'text', text },
      ...mediaToContentParts(media, opts)
    ]
  }
}

export function estimateAttachmentTokens(atts: Attachment[]): number {
  return estimateTokensForText(formatAttachmentsForModel(atts))
}
