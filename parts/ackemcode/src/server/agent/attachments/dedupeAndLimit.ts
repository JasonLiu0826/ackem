import {
  SOURCE_PRIORITY,
  TURN_CHAR_CAP,
  type Attachment,
  type AttachmentSource
} from './types.js'

function pathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/** Same path → keep higher-priority source (lower SOURCE_PRIORITY number). */
export function dedupeAttachments(items: Attachment[]): Attachment[] {
  const byPath = new Map<string, Attachment>()
  for (const item of items) {
    const key = item.path ? pathKey(item.path) : `__${item.source}__${item.label}`
    const prev = byPath.get(key)
    if (!prev) {
      byPath.set(key, item)
      continue
    }
    const pri = SOURCE_PRIORITY[item.source]
    const prevPri = SOURCE_PRIORITY[prev.source]
    if (pri < prevPri) byPath.set(key, item)
    else if (pri === prevPri && item.body.length > prev.body.length) {
      byPath.set(key, item)
    }
  }
  return [...byPath.values()]
}

/** Apply turn-level char budget; truncate lowest-priority attachments first. */
export function applyTurnCharBudget(items: Attachment[]): Attachment[] {
  let used = 0
  const sorted = [...items].sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
  )
  const out: Attachment[] = []
  for (const item of sorted) {
    if (item.omitted) {
      out.push(item)
      continue
    }
    const len = item.body.length
    if (used + len <= TURN_CHAR_CAP) {
      used += len
      out.push(item)
      continue
    }
    out.push({
      ...item,
      omitted: true,
      media: undefined,
      body: item.path
        ? `Attachment omitted (turn budget); use read_file on ${item.path}`
        : 'Attachment omitted (turn budget exceeded).'
    })
  }
  return out.sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
  )
}

export function finalizeAttachments(items: Attachment[]): Attachment[] {
  return applyTurnCharBudget(dedupeAttachments(items))
}

/** Build synthetic attachments from plain text (memory / lsp / post_compact / plan). */
export function textAttachment(opts: {
  kind: Attachment['kind']
  source: AttachmentSource
  path?: string
  label: string
  body: string
}): Attachment {
  return {
    kind: opts.kind,
    source: opts.source,
    path: opts.path ?? '',
    label: opts.label,
    body: opts.body,
    omitted: false
  }
}
