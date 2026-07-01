/** 对话/检索中的「当前时间」上下文（本地时区） */

export function formatCurrentDateLine(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function currentYear(date = new Date()): number {
  return date.getFullYear()
}

const RECENCY_QUERY_HINT =
  /最新|现行|当前|如今|现在|今年|latest|current|recent|newest|version|版本|LTS|发行|发布/u

/** 对「最新版」类 query 追加当前年份，提高搜索引擎时效性 */
export function enrichQueryForRecency(query: string, date = new Date()): string {
  const t = query.trim()
  if (!t) return t
  if (/\b20\d{2}\b/u.test(t)) return t
  if (!RECENCY_QUERY_HINT.test(t)) return t
  return `${t} ${currentYear(date)}`
}

/** 注入 LLM 摘录/知识整理 prompt，避免把 2024/2025 当成「现在」 */
export function recencyPromptSuffix(date = new Date()): string {
  const today = formatCurrentDateLine(date)
  const year = currentYear(date)
  return (
    `【当前日期】${today}（本地时间）。` +
    `用户口中的「现在 / 最新 / 今年」以 ${year} 年为基准。` +
    `若检索摘要或训练知识明显停留在更早年份，须在正文中明确标注数据可能滞后，勿把旧年份当作最新结论。`
  )
}
