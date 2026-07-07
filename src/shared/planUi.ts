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
  { id: 'understand', label: '鐞嗚В闇€姹? },
  { id: 'design', label: '璁捐鏂规' },
  { id: 'generate', label: '鐢熸垚浠ｇ爜' },
  { id: 'validate', label: '鏍￠獙' },
  { id: 'deploy', label: '閮ㄧ讲' }
]

export type PlanChoiceOption = {
  key: 'A' | 'B' | 'C' | 'D'
  title: string
  body: string
  isCustom?: boolean
}

type PlanMsgLike = { role: string; content: string }

const DISPATCH_DIMS = [
  { key: 'habits' as const, labels: ['habits', '涔犳儻', '瑙﹀彂涔犳儻', '鐢ㄦ埛涔犳儻'] },
  { key: 'scenarios' as const, labels: ['scenarios', '鍦烘櫙', '閫傜敤鍦烘櫙'] },
  { key: 'summary' as const, labels: ['summary', '鎽樿', '鍔熻兘鎽樿'] },
  { key: 'keywords' as const, labels: ['keywords', '鍏抽敭璇?, '瑙﹀彂璇?] },
  { key: 'mode' as const, labels: ['mode', '璋冨害妯″紡', 'dispatch.mode'] },
  { key: 'artifactType' as const, labels: ['绫诲瀷', 'artifact', '浜х墿绫诲瀷'] }
]

function splitListValue(raw: string): string[] {
  return raw
    .split(/[路,锛屻€?锛泑鈹俔/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function pickField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[=:锛殀锝淽\\s*([^\\n]+)`, 'i')
    const m = text.match(re)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return undefined
}

function applyDispatchField(draft: PlanDispatchDraft, keyRaw: string, valRaw: string): void {
  const key = keyRaw.trim().toLowerCase()
  const val = valRaw.trim()
  if (!val) return
  if (key === '绫诲瀷' || key === 'artifact' || key === 'artifacttype') draft.artifactType = val
  else if (key === 'mode' || key === '璋冨害妯″紡') draft.mode = val
  else if (key === 'summary' || key === '鎽樿' || key === '鍔熻兘鎽樿') draft.summary = val
  else if (key === 'habits' || key === '涔犳儻') draft.habits = splitListValue(val)
  else if (key === 'scenarios' || key === '鍦烘櫙') draft.scenarios = splitListValue(val)
  else if (key === 'keywords' || key === '鍏抽敭璇?) draft.keywords = splitListValue(val)
  else if (key === 'permissions' || key === '鏉冮檺') draft.permissions = splitListValue(val)
}

function mergeFromConfirmedLine(draft: PlanDispatchDraft, line: string): void {
  for (const part of line.split(/[路|鈹俔/)) {
    const m = part.trim().match(/^([\w.]+)\s*[=:锛歖\s*(.+)$/)
    if (m) applyDispatchField(draft, m[1], m[2])
  }
}

/** 浠?Agent 鏂囨湰鍚堝苟 dispatch draft锛堢疮绉紝涓嶈鐩栧凡鏈夐潪绌哄瓧娈甸櫎闈炴柊鍊兼洿闀匡級 */
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

  const perm = pickField(text, ['鏉冮檺', 'permissions'])
  if (perm) next.permissions = splitListValue(perm)

  next.updatedAt = new Date().toISOString()
  return next
}

/** 浠庢暣娈靛璇濋噸寤?dispatch draft锛堢粨鏋勫寲 JSON 浼樺厛锛宺egex fallback锛?*/
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

/** 灏?`A. foo / B. bar` 鍚岃閫夐」鎷嗘垚澶氳锛屼究浜庤В鏋?*/
function expandInlinePlanChoices(text: string): string {
  return text.replace(
    /(?:^|\n)\s*([A-D])[.)锛庛€乚\s*([^/\n]+?)\s*\/\s*([A-D])[.)锛庛€乚\s*([^\n]+)/g,
    '\n$1. $2\n$3. $4'
  )
}

/** 瑙ｆ瀽 馃搵 鏂规鎽樿 鍧楋紙0 杞垨鏀舵暃鍦烘櫙锛?*/
export function parsePlanSummaryBlock(content: string): PlanSummary | null {
  if (!/馃搵\s*鏂规鎽樿/.test(content)) return null
  const blockMatch = content.match(
    /馃搵\s*鏂规鎽樿([\s\S]*?)(?=\n\n(?:\*{0,2}[A-D][.)锛庛€?\s]|馃叞|[A-D][.)锛庛€乚\s|娌￠棶棰榺鏈夐渶瑕?|$)/i
  )
  const block = blockMatch?.[1] ?? content
  const rawLines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const summary: PlanSummary = { rawLines }
  for (const line of rawLines) {
    const row = line.match(/^\|?\s*([^|锝?]+?)\s*[|锝淽\s*(.+?)\s*\|?\s*$/)
    if (!row) {
      const kv = line.match(/^([^:锛歖+)[锛?]\s*(.+)$/)
      if (kv) {
        const key = kv[1].trim()
        const val = kv[2].trim()
        if (/绫诲瀷|浜х墿/.test(key)) summary.artifactType = val
        else if (/瑙﹀彂|妯″紡/.test(key)) summary.trigger = val
        else if (/杈撳嚭|鎻愰啋|琛屼负/.test(key)) summary.output = val
        else if (/鏉冮檺/.test(key)) summary.permissions = val
        else if (/棰濆|闄勫姞/.test(key)) summary.extras = val
      }
      continue
    }
    const key = row[1].trim()
    const val = row[2].trim()
    if (/绫诲瀷|浜х墿/.test(key)) summary.artifactType = val
    else if (/瑙﹀彂|妯″紡/.test(key)) summary.trigger = val
    else if (/杈撳嚭|鎻愰啋|琛屼负/.test(key)) summary.output = val
    else if (/鏉冮檺/.test(key)) summary.permissions = val
    else if (/棰濆|闄勫姞/.test(key)) summary.extras = val
  }

  if (!summary.artifactType && !summary.trigger && rawLines.length < 2) return null
  return summary
}

/** 灏嗘柟妗堟憳瑕佽浆涓?Markdown 琛ㄦ牸锛堜緵 Plan 宸ヤ綔鍖?md 娓叉煋锛?*/
export function planSummaryToMarkdown(summary: PlanSummary): string {
  const pipeLines = summary.rawLines.filter((line) => /^\|/.test(line.trim()))
  if (pipeLines.length > 0) {
    return pipeLines.join('\n')
  }

  const rows: string[] = []
  if (summary.artifactType?.trim()) rows.push(`| 绫诲瀷 | ${summary.artifactType.trim()} |`)
  if (summary.trigger?.trim()) rows.push(`| 瑙﹀彂 | ${summary.trigger.trim()} |`)
  if (summary.output?.trim()) rows.push(`| 杈撳嚭 | ${summary.output.trim()} |`)
  if (summary.permissions?.trim()) rows.push(`| 鏉冮檺 | ${summary.permissions.trim()} |`)
  if (summary.extras?.trim()) rows.push(`| 棰濆 | ${summary.extras.trim()} |`)
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

/** 鏄惁涓恒€屾寜鏂规寮€濮?/ 纭鏂规銆嶇被閫夐」锛堟樉绀烘柟妗堢‘璁ゅ崱鎿嶄綔锛?*/
export function isPlanConfirmChoice(option: PlanChoiceOption): boolean {
  if (option.key === 'A') {
    return /鎸夎繖涓柟妗坾寮€濮嬪惂|纭鏂规|濂界殑寮€濮媩鎸夋柟妗?i.test(option.title + option.body)
  }
  return false
}

/** 褰撳墠閫夐」閲屾槸鍚﹀寘鍚€屾寜鏂规寮€濮嬨€嶇被纭椤?*/
export function hasPlanConfirmChoices(options: PlanChoiceOption[]): boolean {
  return options.some(isPlanConfirmChoice)
}

/** Plan 宸ヤ綔鍖哄紑鍦虹櫧锛堢敤鎴峰凡鍙戣█鍚庝笉鍐嶅睍绀猴級 */
export function isPlanIntroMessage(content: string): boolean {
  const t = content.trim()
  if (!t || t.length > 280) return false
  return /鎴戞槸 Ackem Agent/i.test(t) && /璇锋弿杩颁綘鎯冲垱寤虹殑/.test(t) && parsePlanChoices(t).length < 2
}

/** 浠?Agent 鍥炲涓Щ闄ゅ凡鍦ㄧ嫭绔?UI 鍖哄睍绀虹殑鍧楋紝閬垮厤 Plan 瀵硅瘽鍖洪噸澶嶅崰浣?*/
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
        /馃搵\s*鏂规鎽樿[\s\S]*?(?=\n\n(?:\*{0,2}[A-D][.)锛庛€?\s]|馃叞|[A-D][.)锛庛€乚\s|娌￠棶棰榺鏈夐渶瑕?|$)/i,
        ''
      )
      .trim()
  }

  if (opts?.hideConfirmedLine) {
    text = text.replace(/(?:^|\n)宸茬‘璁锛?][^\n]*(?=\n|$)/g, '\n').trim()
  }

  if (opts?.hideChoices && parsePlanChoices(text).length >= 2) {
    const headerRe =
      /(?:^|\n)(?:馃叞|馃叡|馃叢|馃叧|\*{0,2}([A-D])[.)锛庛€?\s]*\*{0,2})\s*[^\n]+/g
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

/** 閫夐」鏍囬琛岋細A. / **A.** / 馃叞 绛?*/
function parseChoiceHeaderKey(match: RegExpExecArray): PlanChoiceOption['key'] | null {
  const keyRaw = match[1] ?? match[0].replace(/[^\w]/g, '').slice(-1)
  const key = keyRaw.toUpperCase()
  return ['A', 'B', 'C', 'D'].includes(key) ? (key as PlanChoiceOption['key']) : null
}

function trimChoiceBody(raw: string): string {
  let body = raw.trim()
  body = body.replace(/(?:^|\n)\s*宸茬‘璁锛?][^\n]*/g, '').trim()
  const embedded = body.search(
    /\n\s*(?:馃叞|馃叡|馃叢|馃叧|\*{0,2}[A-D][.)锛庛€?\s]*\*{0,2})\s/u
  )
  if (embedded >= 0) body = body.slice(0, embedded).trim()
  body = body.replace(/\s+\*{0,2}[A-D][.)锛庛€?\s]*\*{0,2}\s*[^\n]+$/u, '').trim()
  return stripMarkdownInline(body)
}

export function parsePlanChoices(content: string): PlanChoiceOption[] {
  const text = expandInlinePlanChoices(content.trim())
  if (!text) return []

  const headerRe =
    /(?:^|\n)(?:馃叞|馃叡|馃叢|馃叧|\*{0,2}([A-D])[.)锛庛€?\s]*\*{0,2})\s*([^\n]+)/g
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
      if (body.length > 160) body = `${body.slice(0, 157)}鈥
      return {
        key: h.key,
        title: h.title,
        body,
        isCustom: /鑷繁鍐檤鑷畾涔墊鎴戞潵鍐檤鎴戞兂鏀?i.test(h.title)
      }
    })
  }

  return []
}

export function parsePlanConfirmedLine(content: string): string | null {
  const m = content.match(/宸茬‘璁锛?]\s*(.+?)(?:\n|$)/)
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

  if (/閮ㄧ讲瀹屾垚|宸查儴缃瞸娉ㄥ唽鎴愬姛/.test(lastAssistant)) return 'deploy'
  if (/鏍￠獙閫氳繃|validateDispatch|鏍￠獙澶辫触/.test(lastAssistant)) return 'validate'
  if (/寮€濮嬪啓浠ｇ爜|鐢熸垚浠ｇ爜|姝ｅ湪鐢熸垚|manifest\.json/.test(lastAssistant)) return 'generate'
  if (
    findLatestPlanSummary(messages) ||
    isDispatchDraftComplete(opts?.dispatchDraft ?? {}) ||
    /鏂规鎽樿|璋冨害閰嶇疆|dispatch|habits|scenarios|瑙﹀彂鏂瑰紡|閫傜敤鍦烘櫙/.test(lastAssistant)
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
    return `鎴戦€夋嫨 ${option.key}锛堣嚜瀹氫箟锛夛細${customText.trim()}`
  }
  if (body) {
    return `鎴戦€夋嫨 ${option.key}锛?{title} 鈥?${body}`
  }
  return `鎴戦€夋嫨 ${option.key}锛?{title}`
}

export const DISPATCH_DRAFT_FIELDS: {
  key: keyof PlanDispatchDraft
  label: string
  list?: boolean
}[] = [
  { key: 'artifactType', label: '浜х墿绫诲瀷' },
  { key: 'mode', label: '璋冨害 mode' },
  { key: 'summary', label: '鍔熻兘鎽樿 summary' },
  { key: 'habits', label: '瑙﹀彂涔犳儻 habits', list: true },
  { key: 'scenarios', label: '閫傜敤鍦烘櫙 scenarios', list: true },
  { key: 'keywords', label: '鍏抽敭璇?keywords', list: true },
  { key: 'permissions', label: '鏉冮檺 permissions', list: true }
]

/** Plan 鍙栨秷閮ㄧ讲鍚庢彃鍏ュ璇濈殑绯荤粺璇存槑锛坅ssistant锛?*/
export const PLAN_DEPLOY_CANCELLED_ASSISTANT_MSG =
  '鈴?**閮ㄧ讲宸插彇娑?*銆傜敓鎴?閮ㄧ讲绠＄嚎宸插仠姝€備綘鍙互缁х画鎻忚堪淇敼鎯虫硶锛屾垨鍦ㄨ緭鍏ユ鍙戦€?**閲嶆柊閮ㄧ讲** 鎸夊綋鍓嶅凡纭鏂规鍐嶈瘯銆?

export const PLAN_REDEPLOY_STARTED_ASSISTANT_MSG =
  '鈴?**閲嶆柊閮ㄧ讲** 宸叉寜褰撳墠宸茬‘璁ゆ柟妗堝惎鍔ㄧ敓鎴愪笌閮ㄧ讲鈥?

/** 杈撳叆妗嗗彂閫併€岄噸鏂伴儴缃层€嶇瓑鐭寚浠ゆ椂璧?redeploy锛屼笉璧?Plan Agent */
export function isPlanRedeployIntent(text: string): boolean {
  const t = text.trim().replace(/[銆愩€慮/g, '')
  return /^(閲嶆柊閮ㄧ讲|缁х画閮ㄧ讲|鍐嶆閮ㄧ讲|閲嶈瘯閮ㄧ讲)$/u.test(t)
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
