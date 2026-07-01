/**
 * 纸面卡展示标题 — 规则层（无实体词表）
 * 避免把用户整句抱怨、问句或动作词残留当作卡片标题。
 */

export type PaperCardKind = 'plan' | 'knowledge' | 'search' | 'table'

const POOR_TITLE_PATTERNS: RegExp[] = [
  /(?:怎么|为什么|为何|啥意思|整了个|就一个|不是吗|不对吧|搞个|整了)/u,
  /(?:我让你|你说|刚才|上面|下面)/u,
  /[？?]\s*$/,
  /.{36,}/u,
  /^(?:计划书|整理卡|对比表|表格|检索)[，,：:]/u
]

export function isPoorPaperCardTitle(title: string): boolean {
  const t = title.trim()
  if (t.length < 2) return true
  if (POOR_TITLE_PATTERNS.some((re) => re.test(t))) return true
  if (/^(?:计划|表格|整理|检索|知识)$/u.test(t)) return true
  return false
}

function sanitizeExtracted(raw: string): string | null {
  const t = raw
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/u, '')
    .replace(/^[「『"']|[」』"']$/gu, '')
    .trim()
    .slice(0, 28)
  if (t.length < 2 || isPoorPaperCardTitle(t)) return null
  return t
}

/** 从已生成的 Markdown 正文推断简短标题 */
export function extractTitleFromCardBody(cardBody: string, kind: PaperCardKind): string | null {
  const t = cardBody.trim()
  if (!t) return null

  const planHeading = t.match(/^#\s*计划[:：]\s*(.+)$/m)
  if (planHeading?.[1]) {
    const hit = sanitizeExtracted(planHeading[1])
    if (hit) return hit
  }

  const anyH1 = t.match(/^#\s+(.+)$/m)
  if (anyH1?.[1]) {
    const hit = sanitizeExtracted(anyH1[1])
    if (hit && !/^计划$/u.test(hit)) return hit
  }

  const boldLead = t.match(/^\*\*(.{2,40})\*\*/m)
  if (boldLead?.[1]) {
    const hit = sanitizeExtracted(boldLead[1])
    if (hit) return hit
  }

  if (kind === 'table' || kind === 'search' || kind === 'plan') {
    const tableHeader = t.match(/^\|([^|\n]+(?:\|[^|\n]+)+)\|\s*$/m)
    if (tableHeader?.[1]) {
      const cols = tableHeader[1]
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      if (cols.length >= 2) {
        const joined = cols.slice(0, 3).join('·')
        const hit = sanitizeExtracted(joined)
        if (hit) return hit
      }
    }
  }

  return null
}

export function defaultPaperCardTitle(kind: PaperCardKind): string {
  switch (kind) {
    case 'plan':
      return '执行计划'
    case 'knowledge':
      return '知识整理'
    case 'search':
      return '检索摘录'
    case 'table':
      return '对比表'
  }
}

/** 计划书：用户抱怨/追问上一轮结果，不应再次触发生成 */
export function isPlanDocumentMetaOrComplaint(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  if (/怎么.{0,28}(?:计划|计划书)|为什么.{0,28}(?:计划|计划书)/u.test(t)) return true
  if (/让你.{0,16}(?:生成|做|写|整).{0,16}(?:计划|计划书).{0,16}怎么/u.test(t)) return true
  if (/(?:计划|计划书).{0,8}就.{0,8}(?:整|做|生成)/u.test(t) && /怎么/u.test(t)) return true
  return false
}
