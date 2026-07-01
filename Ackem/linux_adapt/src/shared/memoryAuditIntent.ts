/**
 * 记忆审计意图 — 纯规则（与 remember/forget、计划书正交）
 */

export type MemoryAuditMode = 'curated_audit' | 'self_report' | 'stats_only' | 'full_dump'

export type MemoryAuditIntent = {
  mode: MemoryAuditMode
  /** 用户明确要求包含 sensitivity=avoid 的事实 */
  includeAvoid: boolean
  /** full_dump 分页（从 1 起） */
  page?: number
  confidence: number
}

const AUDIT_NEGATION_RE =
  /不要(?:列|写|说|提|翻).{0,8}记忆|别(?:列|写|说|提|翻).{0,8}记忆|不用(?:列|写|说|提|翻).{0,8}记忆|不必(?:列|写|说|提|翻).{0,8}记忆/u

const INCLUDE_AVOID_RE =
  /包括.{0,6}(?:隐藏|秘密|不想被提起)|全部.{0,6}(?:不要|别).{0,4}隐藏|连.{0,4}(?:隐藏|秘密).{0,4}一起/u

const STATS_ONLY_RE =
  /(?:有多少|一共|总共|统计).{0,12}(?:条|个)?记忆|记忆.{0,8}(?:统计|数量|多少条)|几条记忆/u

const FULL_DUMP_RE =
  /(?:每一条|完整列表|全表|全量导出).{0,12}(?:记忆|事实)|(?:导出|列出).{0,8}(?:全部|所有|完整).{0,8}(?:记忆|事实)(?:明细|列表|表格)?/u

const SELF_REPORT_RE =
  /你(?:有多|有多深|有多了解|对我).{0,12}(?:了解|认识|知道|熟悉)|说说你(?:对|关于)我(?:的)?(?:认识|了解|印象|知道)|你(?:记得|知道)我什么|你眼里的我|在你(?:心中|眼里|看来)我|你对我的(?:认识|了解|印象)/u

const CURATED_AUDIT_RE =
  /(?:导出|列出|写|列|整理|翻|盘点|汇总).{0,12}(?:记忆|事实|档案)|(?:记忆|事实).{0,8}(?:表格|清单|列表|导出)|你(?:知道|记得).{0,8}(?:关于)?我(?:的)?(?:全部|所有|哪些|什么)|全部记忆|我的记忆/u

const NEXT_PAGE_RE = /(?:记忆|事实).{0,6}(?:下一页|继续)|下一页.{0,8}(?:记忆|事实)|继续.{0,6}(?:列|列完)/u

const REMEMBER_BLOCK_RE =
  /请帮我记住|帮我记住|帮我记着|记住我|别忘了|不要忘记|don't forget|remember that/i

const FORGET_BLOCK_RE = /忘掉|别记了|forget this|不要记住|不要记/i

function blocksRememberOrForget(msg: string): boolean {
  const lower = msg.toLowerCase().trim()
  if (/不用记住|不要记住|不必记住|dont remember|don't remember/i.test(lower)) return false
  return REMEMBER_BLOCK_RE.test(msg) || FORGET_BLOCK_RE.test(msg)
}

function hasAuditNegation(msg: string): boolean {
  return AUDIT_NEGATION_RE.test(msg)
}

function wantsIncludeAvoid(msg: string): boolean {
  return INCLUDE_AVOID_RE.test(msg)
}

/** 与 OpenForU / 扩展 / 计划书冲突时由调用方再判 */
export function detectMemoryAuditIntent(
  msg: string,
  recentMessages?: Array<{ role: string; content: string }>
): MemoryAuditIntent | null {
  const trimmed = msg.trim()
  if (!trimmed || trimmed.length < 4) return null
  if (hasAuditNegation(trimmed)) return null
  if (blocksRememberOrForget(trimmed)) return null

  const includeAvoid = wantsIncludeAvoid(trimmed)

  if (STATS_ONLY_RE.test(trimmed)) {
    return { mode: 'stats_only', includeAvoid, confidence: 0.9 }
  }

  if (SELF_REPORT_RE.test(trimmed)) {
    return { mode: 'self_report', includeAvoid, confidence: 0.9 }
  }

  if (CURATED_AUDIT_RE.test(trimmed)) {
    return { mode: 'curated_audit', includeAvoid, confidence: 0.85 }
  }

  if (FULL_DUMP_RE.test(trimmed)) {
    const page = NEXT_PAGE_RE.test(trimmed) ? 2 : 1
    return { mode: 'full_dump', includeAvoid, page, confidence: 0.88 }
  }

  if (recentMessages?.length) {
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const m = recentMessages[i]
      if (m.role !== 'user') continue
      if (m.content === trimmed) break
      if (NEXT_PAGE_RE.test(trimmed) && FULL_DUMP_RE.test(m.content)) {
        return { mode: 'full_dump', includeAvoid, page: 2, confidence: 0.82 }
      }
    }
  }

  return null
}

export function buildMemoryAuditIntro(mode: MemoryAuditMode, factsListed: number, totalActive: number): string {
  if (mode === 'stats_only') {
    return `我这边一共记着 **${totalActive}** 条关于你的活跃事实。`
  }
  if (mode === 'self_report') {
    return `从我目前记得的部分来说——一共 ${totalActive} 条里，挑了 ${factsListed} 条最重要的：`
  }
  if (mode === 'full_dump') {
    return `按你的要求列明细（全量较多，建议也可去「记忆档案」浏览）：`
  }
  return `帮你从 ${totalActive} 条记忆里挑了 ${factsListed} 条权重最高、再加关键时间点的部分：`
}
