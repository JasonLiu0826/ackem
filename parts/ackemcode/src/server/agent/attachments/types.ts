/** G-03 attachment bus — unified shape (边角对齐 §2.1). */

export type AttachmentKind =
  | 'file'
  | 'dir'
  | 'image'
  | 'memory'
  | 'post_compact'
  | 'plan'
  | 'lsp'
  | 'queue'

export type AttachmentSource =
  | 'at_mention'
  | 'workbench_chip'
  | 'workbench_open'
  | 'prefetch'
  | 'post_compact'
  | 'plan'
  | 'lsp'
  | 'queue_inject'
  | 'task_notification'

export type Attachment = {
  kind: AttachmentKind
  source: AttachmentSource
  path: string
  label: string
  body: string
  omitted: boolean
  /** Vision path: page/image bytes (not persisted in the text body). */
  media?: import('../../tools/files/types.js').ToolMediaPart[]
}

/** Host POST /chat attachment stub (G-05). */
export type HostAttachmentInput = {
  path: string
  kind: 'file' | 'dir' | 'image'
  source?: 'workbench_chip' | 'workbench_open'
}

export const FILE_CHAR_CAP = 32_000
export const TURN_CHAR_CAP = 64_000
export const DIR_CHILD_CAP = 50

/** Lower = wins on dedupe (边角对齐 §2.3). */
export const SOURCE_PRIORITY: Record<AttachmentSource, number> = {
  workbench_chip: 0,
  at_mention: 1,
  workbench_open: 2,
  prefetch: 3,
  post_compact: 4,
  plan: 5,
  lsp: 6,
  queue_inject: 7,
  task_notification: 8
}
