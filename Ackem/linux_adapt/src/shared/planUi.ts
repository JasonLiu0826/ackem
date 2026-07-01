import type { PlanDispatchDraft, PlanSummary } from './planSession'
import {
  mergeDispatchDraftFromStructured,
  parsePlanStructuredBlock,
  planSummaryFromStructured,
  stripPlanStructuredBlock
} from './planStructured'

export type { PlanDispatchDraft, PlanSummary } from './planSession'

export type PlanStageId = 'understand' | 'design' | 'generate' | 'validate' | 'deploy'

export const PLAN_STAGES: { id: PlanStageId; label: string }[] = [
  { id: 'understand', label: '理解需求' },
  { id: 'design', label: '设计方案' },
  { id: 'generate', label: '生成代码' },
  { id: 'validate', label: '校验' },
  { id: 'deploy', label: '部署' }
]

export type PlanChoiceOption = {
  key: 'A' | 'B' | 'C' | 'D'
  title: string
  body: string
  isCustom?: boolean
}

type PlanMsgLike = { role: string; content: string }

const DISPATCH_DIMS = [
  { key: 'habits' as const, labels: ['habits', '习惯', '触发习惯', '用户习惯'] },
  { key: 'scenarios' as const, labels: ['scenarios', '场景', '适用场景'] },
  { key: 'summary' as const, labels: ['summary', '摘要', '功能摘要'] },
  { key: 'keywords' as const, labels: ['keywords', '关键词', '触发词'] },
  { key: 'mode' as const, labels: ['mode', '调度模式', 'dispatch.mode'] },
  { key: 'artifactType' as const, labels: ['类型', 'artifact', '产物类型'] }
]

function splitListValue(raw: string): string[] {
  return raw
    .split(/[·,，、;；|│]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function pickField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[=:：|｜]\\s*([^\\n]+)`, 'i')
    const m = text.match(re)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return undefined
}

function applyDispatchField(draft: PlanDispatchDraft, keyRaw: string, valRaw: string): void {
  const key = keyRaw.trim().toLowerCase()
  const val = valRaw.trim()
  if (!val) return
  if (key === '类型' || key === 'artifact' || key === 'artifacttype') draft.artifactType = val
  else if (key === 'mode' || key === '调度模式') draft.mode = val
  else if (key === 'summary' || key === '摘要' || key === '功能摘要') draft.summary = val
  else if (key === 'habits' || key === '习惯') draft.habits = splitListValue(val)
  else if (key === 'scenarios' || key === '场景') draft.scenarios = splitListValue(val)
  else if (key === 'keywords' || key === '关键词') draft.keywords = splitListValue(val)
  else if (key === 'permissions' || key === '权限') draft.permissions = splitListValue(val)
}

function mergeFromConfirmedLine(draft: PlanDispatchDraft, line: string): void {
  for (const part of line.split(/[·|│]/)) {
    const m = part.trim().match(/^([\w.]+)\s*[=:：]\s*(.+)$/)
    if (m) applyDispatchField(draft, m[1], m[2])
  }
}

/** 从 Agent 文本合并 dispatch draft（累积，不覆盖已有非空字段除非新值更长） */
export function mergeDispatchDraft(
  prev: PlanDispatchDraft,
  assistantContent: string,
  confirmedLine?: string | null
): PlanDispatchDraft {
  const text = assistantContent
  const next: PlanDispatchDraft = { ...prev }

  const confirmed = confirmedLine ?? parsePlanConfirmedLine(assistantContent)
  if (confirmed) mergeFromConfirmedLine(next, confirmed)

  for (const dim of DISPATCH_DIMS) {
    const raw = pickField(text, dim.labels)
    if (!raw) continue
    if (dim.key === 'habits' || dim.key === 'scenarios' || dim.key === 'keywords') {
      const list = splitListValue(raw)
      if (list.length) next[dim.key] = list
    } else if (dim.key === 'summary' || dim.key === 'mode' || dim.key === 'artifactType') {
      next[dim.key] = raw
    }
  }

  const perm = pickField(text, ['权限', 'permissions'])
  if (perm) next.permissions = splitListValue(perm)

  next.updatedAt = new Date().toISOString()
  return next
}

/** 从整段对话重建 dispatch draft（结构化 JSON 优先，regex fallback） */
export function rebuildDispatchDraftFromMessages(
  messages: PlanMsgLike[]
): PlanDispatchDraft {
  let draft: PlanDispatchDraft = {}
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    const structured = parsePlanStructuredBlock(m.content)
    if (structured) {
      draft = mergeDispatchDraftFromStructured(draft, structured)
      continue
    }
    draft = mergeDispatchDraft(draft, m.content, parsePlanConfirmedLine(m.content))
  }
  return draft
}

export function isDispatchDraftComplete(draft: PlanDispatchDraft): boolean {
  return Boolean(
    draft.summary?.trim() &&
      draft.habits?.length &&
      draft.scenarios?.length &&
      draft.keywords?.length
  )
}

/** 将 `A. foo / B. bar` 同行选项拆成多行，便于解析 */
function expandInlinePlanChoices(text: string): string {
  return text.replace(
    /(?:^|\n)\s*([A-D])[.)．、]\s*([^/\n]+?)\s*\/\s*([A-D])[.)．、]\s*([^\n]+)/g,
    '\n$1. $2\n$3. $4'
  )
}

/** 解析 📋 方案摘要 块（0 轮或收敛场景） */
export function parsePlanSummaryBlock(content: string): PlanSummary | null {
  if (!/📋\s*方案摘要/.test(content)) return null
  const blockMatch = content.match(
    /📋\s*方案摘要([\s\S]*?)(?=\n\n(?:\*{0,2}[A-D][.)．、:\s]|🅰|[A-D][.)．、]\s|没问题|有需要)|$)/i
  )
  const block = blockMatch?.[1] ?? content
  const rawLines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const summary: PlanSummary = { rawLines }
  for (const line of rawLines) {
    const row = line.match(/^\|?\s*([^|｜:]+?)\s*[|｜]\s*(.+?)\s*\|?\s*$/)
    if (!row) {
      const kv = line.match(/^([^:：]+)[：:]\s*(.+)$/)
      if (kv) {
        const key = kv[1].trim()
        const val = kv[2].trim()
        if (/类型|产物/.test(key)) summary.artifactType = val
        else if (/触发|模式/.test(key)) summary.trigger = val
        else if (/输出|提醒|行为/.test(key)) summary.output = val
        else if (/权限/.test(key)) summary.permissions = val
        else if (/额外|附加/.test(key)) summary.extras = val
      }
      continue
    }
    const key = row[1].trim()
    const val = row[2].trim()
    if (/类型|产物/.test(key)) summary.artifactType = val
    else if (/触发|模式/.test(key)) summary.trigger = val
    else if (/输出|提醒|行为/.test(key)) summary.output = val
    else if (/权限/.test(key)) summary.permissions = val
    else if (/额外|附加/.test(key)) summary.extras = val
  }

  if (!summary.artifactType && !summary.trigger && rawLines.length < 2) return null
  return summary
}

/** 将方案摘要转为 Markdown 表格（供 Plan 工作区 md 渲染） */
export function planSummaryToMarkdown(summary: PlanSummary): string {
  const pipeLines = summary.rawLines.filter((line) => /^\|/.test(line.trim()))
  if (pipeLines.length > 0) {
    return pipeLines.join('\n')
  }

  const rows: string[] = []
  if (summary.artifactType?.trim()) rows.push(`| 类型 | ${summary.artifactType.trim()} |`)
  if (summary.trigger?.trim()) rows.push(`| 触发 | ${summary.trigger.trim()} |`)
  if (summary.output?.trim()) rows.push(`| 输出 | ${summary.output.trim()} |`)
  if (summary.permissions?.trim()) rows.push(`| 权限 | ${summary.permissions.trim()} |`)
  if (summary.extras?.trim()) rows.push(`| 额外 | ${summary.extras.trim()} |`)
  return rows.join('\n')
}

export function findLatestPlanSummary(messages: PlanMsgLike[]): PlanSummary | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue
    const structured = parsePlanStructuredBlock(messages[i].content)
    if (structured) {
      const fromStructured = planSummaryFromStructured(structured)
      if (fromStructured) return fromStructured
    }
    const s = parsePlanSummaryBlock(messages[i].content)
    if (s) return s
  }
  return null
}

export function isPlanSummaryReady(summary: PlanSummary | null | undefined): boolean {
  return Boolean(summary?.artifactType?.trim() || summary?.trigger?.trim())
}

/** 是否为「按方案开始 / 确认方案」类选项（显示方案确认卡操作） */
export function isPlanConfirmChoice(option: PlanChoiceOption): boolean {
  if (option.key === 'A') {
    return /按这个方案|开始吧|确认方案|好的开始|按方案/i.test(option.title + option.body)
  }
  return false
}

/** 当前选项里是否包含「按方案开始」类确认项 */
export function hasPlanConfirmChoices(options: PlanChoiceOption[]): boolean {
  return options.some(isPlanConfirmChoice)
}

/** Plan 工作区开场白（用户已发言后不再展示） */
export function isPlanIntroMessage(content: string): boolean {
  const t = content.trim()
  if (!t || t.length > 280) return false
  return /我是 Ackem Agent/i.test(t) && /请描述你想创建的/.test(t) && parsePlanChoices(t).length < 2
}

/** 从 Agent 回复中移除已在独立 UI 区展示的块，避免 Plan 对话区重复占位 */
export function stripPlanAssistantForDisplay(
  content: string,
  opts?: {
    hideChoices?: boolean
    hideConfirmedLine?: boolean
    hideSummaryBlock?: boolean
  }
): string {
  let text = stripPlanStructuredBlock(content)

  if (opts?.hideSummaryBlock) {
    text = text
      .replace(
        /📋\s*方案摘要[\s\S]*?(?=\n\n(?:\*{0,2}[A-D][.)．、:\s]|🅰|[A-D][.)．、]\s|没问题|有需要)|$)/i,
        ''
      )
      .trim()
  }

  if (opts?.hideConfirmedLine) {
    text = text.replace(/(?:^|\n)已确认[：:][^\n]*(?=\n|$)/g, '\n').trim()
  }

  if (opts?.hideChoices && parsePlanChoices(text).length >= 2) {
    const headerRe =
      /(?:^|\n)(?:🅰|🅱|🅲|🅳|\*{0,2}([A-D])[.)．、:\s]*\*{0,2})\s*[^\n]+/g
    let firstIdx = -1
    let count = 0
    let hm: RegExpExecArray | null
    while ((hm = headerRe.exec(text)) !== null) {
      if (firstIdx === -1) firstIdx = hm.index
      count++
    }
    if (count >= 2 && firstIdx >= 0) {
      text = text.slice(0, firstIdx).trimEnd()
    }
  }

  return text.trim()
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

/** 选项标题行：A. / **A.** / 🅰 等 */
function parseChoiceHeaderKey(match: RegExpExecArray): PlanChoiceOption['key'] | null {
  const keyRaw = match[1] ?? match[0].replace(/[^\w]/g, '').slice(-1)
  const key = keyRaw.toUpperCase()
  return ['A', 'B', 'C', 'D'].includes(key) ? (key as PlanChoiceOption['key']) : null
}

function trimChoiceBody(raw: string): string {
  let body = raw.trim()
  body = body.replace(/(?:^|\n)\s*已确认[：:][^\n]*/g, '').trim()
  const embedded = body.search(
    /\n\s*(?:🅰|🅱|🅲|🅳|\*{0,2}[A-D][.)．、:\s]*\*{0,2})\s/u
  )
  if (embedded >= 0) body = body.slice(0, embedded).trim()
  body = body.replace(/\s+\*{0,2}[A-D][.)．、:\s]*\*{0,2}\s*[^\n]+$/u, '').trim()
  return stripMarkdownInline(body)
}

export function parsePlanChoices(content: string): PlanChoiceOption[] {
  const text = expandInlinePlanChoices(content.trim())
  if (!text) return []

  const headerRe =
    /(?:^|\n)(?:🅰|🅱|🅲|🅳|\*{0,2}([A-D])[.)．、:\s]*\*{0,2})\s*([^\n]+)/g
  const headers: {
    key: PlanChoiceOption['key']
    title: string
    index: number
    lineEnd: number
  }[] = []
  let hm: RegExpExecArray | null
  while ((hm = headerRe.exec(text)) !== null) {
    const key = parseChoiceHeaderKey(hm)
    if (!key) continue
    headers.push({
      key,
      title: stripMarkdownInline(hm[2].trim()),
      index: hm.index,
      lineEnd: hm.index + hm[0].length
    })
  }

  if (headers.length >= 2) {
    return headers.slice(0, 4).map((h, i) => {
      const nextIndex = headers[i + 1]?.index ?? text.length
      let body = trimChoiceBody(text.slice(h.lineEnd, nextIndex))
      if (body.length > 160) body = `${body.slice(0, 157)}…`
      return {
        key: h.key,
        title: h.title,
        body,
        isCustom: /自己写|自定义|我来写|我想改/i.test(h.title)
      }
    })
  }

  return []
}

export function parsePlanConfirmedLine(content: string): string | null {
  const m = content.match(/已确认[：:]\s*(.+?)(?:\n|$)/)
  return m?.[1]?.trim() || null
}

export function countPlanUserTurns(messages: PlanMsgLike[]): number {
  return messages.filter((m) => m.role === 'user').length
}

export function inferPlanStage(
  messages: PlanMsgLike[],
  opts?: {
    planConfirmed?: boolean
    dispatchDraft?: PlanDispatchDraft
    deployedUskillId?: string
  }
): PlanStageId {
  if (opts?.deployedUskillId) return 'deploy'
  if (opts?.planConfirmed) return 'generate'
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? ''
  const userTurns = countPlanUserTurns(messages)

  if (/部署完成|已部署|注册成功/.test(lastAssistant)) return 'deploy'
  if (/校验通过|validateDispatch|校验失败/.test(lastAssistant)) return 'validate'
  if (/开始写代码|生成代码|正在生成|manifest\.json/.test(lastAssistant)) return 'generate'
  if (
    findLatestPlanSummary(messages) ||
    isDispatchDraftComplete(opts?.dispatchDraft ?? {}) ||
    /方案摘要|调度配置|dispatch|habits|scenarios|触发方式|适用场景/.test(lastAssistant)
  ) {
    return 'design'
  }
  if (userTurns >= 4) return 'design'
  return 'understand'
}

export function planStageIndex(stage: PlanStageId): number {
  return PLAN_STAGES.findIndex((s) => s.id === stage)
}

export function formatChoiceReply(option: PlanChoiceOption, customText?: string): string {
  const title = stripMarkdownInline(option.title)
  const body = option.body ? stripMarkdownInline(option.body) : ''
  if (option.isCustom && customText?.trim()) {
    return `我选择 ${option.key}（自定义）：${customText.trim()}`
  }
  if (body) {
    return `我选择 ${option.key}：${title} — ${body}`
  }
  return `我选择 ${option.key}：${title}`
}

export const DISPATCH_DRAFT_FIELDS: {
  key: keyof PlanDispatchDraft
  label: string
  list?: boolean
}[] = [
  { key: 'artifactType', label: '产物类型' },
  { key: 'mode', label: '调度 mode' },
  { key: 'summary', label: '功能摘要 summary' },
  { key: 'habits', label: '触发习惯 habits', list: true },
  { key: 'scenarios', label: '适用场景 scenarios', list: true },
  { key: 'keywords', label: '关键词 keywords', list: true },
  { key: 'permissions', label: '权限 permissions', list: true }
]

/** Plan 取消部署后插入对话的系统说明（assistant） */
export const PLAN_DEPLOY_CANCELLED_ASSISTANT_MSG =
  '⏹ **部署已取消**。生成/部署管线已停止。你可以继续描述修改想法，或在输入框发送 **重新部署** 按当前已确认方案再试。'

export const PLAN_REDEPLOY_STARTED_ASSISTANT_MSG =
  '⏳ **重新部署** 已按当前已确认方案启动生成与部署…'

/** 输入框发送「重新部署」等短指令时走 redeploy，不走 Plan Agent */
export function isPlanRedeployIntent(text: string): boolean {
  const t = text.trim().replace(/[【】]/g, '')
  return /^(重新部署|继续部署|再次部署|重试部署)$/u.test(t)
}

export function isPlanPostCancelComposerHint(input: {
  planConfirmed: boolean
  deployedUskillId?: string
  agentRunStatus?: string | null
  lastAssistantHasCancelNotice?: boolean
}): boolean {
  return (
    Boolean(input.planConfirmed) &&
    !input.deployedUskillId &&
    (input.agentRunStatus === 'cancelled' || Boolean(input.lastAssistantHasCancelNotice))
  )
}
