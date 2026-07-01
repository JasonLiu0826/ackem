// [searchSynthesis] — 搜索后：纸面卡正文总结 + 伴侣口吻短评（接入 context 里的人格/情绪/记忆）

import type { WebContents } from 'electron'
import type { AppSettings } from '../../../../../settings'
import { createLlmJsonClient } from '../../../../../llmClient'
import type { SearchResult } from './search'
import { formatSearchResults } from './search'
import type { SearchCardPayload, WebSearchHit } from '../../../../../../shared/searchCard'
import type { UserTaskFrame } from '../../../../../../shared/taskFrame'
import { pluginActivityLabel } from '../../../../../chatStatusLabels'
import { recencyPromptSuffix } from './recencyContext'
import {
  buildCardBodyFormatBlock,
  buildCompanionReplyFormatBlock
} from '../../../../../taskFrame/formatInstructions'
import {
  buildPaperCardCompanionUserTail,
  defaultPaperCardCompanionFallback,
  PAPER_CARD_COMPANION_SYSTEM_SUFFIX
} from '../../../../../paperCardCompanionPrompt'
import { finalizePaperCardCompanionReply } from '../../../../../paperCard/finalizeCompanionReply'
import { resolvePaperCardDisplayTitle } from '../../../../../paperCard/resolveDisplayTitle'
import { beginMarkdownTableSkillActivity } from '../../../../skills/builtin/tool/markdown-table/skillBridge'
import {
  ACKEM_PRODUCT_IDENTITY_GUARD,
  buildAckemCompareCardBlock,
  sanitizeAckemIdentityInMarkdown
} from '../../../../../paperCard/ackemProductIdentity'

export type SearchSynthesisInput = {
  query: string
  results: SearchResult[]
  error?: string
  /** LLM 澄清后的检索意图（摘录与来源筛选已用过） */
  intentSummary?: string
  /** L0 用户任务框（交付形态） */
  taskFrame?: UserTaskFrame
}

export type SearchSynthesisOutput = {
  cardBody: string
  companionReply: string
  sources: WebSearchHit[]
  copyText: string
  displayTitle: string
}

const SOURCE_MIN = 3
const SOURCE_MAX = 8

/** 摘录正文生成上限（偏长、偏全） */
const CARD_BODY_MAX_TOKENS = 3200

const OFFICIAL_HOST_PATTERNS = [
  /oracle\.com/i,
  /openjdk\.org/i,
  /jdk\.java\.net/i,
  /docs\.microsoft/i,
  /learn\.microsoft/i,
  /golang\.org/i,
  /rust-lang\.org/i,
  /python\.org/i,
  /nodejs\.org/i,
  /wikipedia\.org/i,
  /apache\.org/i,
  /spring\.io/i,
  /jetbrains\.com/i,
  /developer\.(apple|mozilla)/i,
  /infoq\.(com|cn)/i
]

/** 官方/文档类来源优先，供摘录合成阅读 */
export function prioritizeOfficialResults(results: SearchResult[]): SearchResult[] {
  const score = (r: SearchResult): number => {
    const blob = `${r.url} ${r.title} ${r.snippet}`
    let s = 0
    for (const p of OFFICIAL_HOST_PATTERNS) {
      if (p.test(blob)) s += 12
    }
    if (/docs?\.|documentation|官方|release notes|whitepaper|specification/i.test(blob)) s += 6
    if (/blog|论坛|问答|知乎|贴吧|自媒体/i.test(blob)) s -= 3
    return s
  }
  return [...results].sort((a, b) => score(b) - score(a))
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function extractSystemFromMessages(
  messages: Array<{ role: string; content: unknown }>
): string {
  const sys = messages.find(m => m.role === 'system')
  return sys ? messageText(sys.content) : ''
}

function extractLastUserQuestion(
  messages: Array<{ role: string; content: unknown }>
): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  return last ? messageText(last.content) : ''
}

/** 同轮仅保留一条搜索任务（意图澄清后应已合并） */
export function consolidateSearchJobs(jobs: SearchSynthesisInput[]): SearchSynthesisInput[] {
  if (jobs.length <= 1) return jobs
  const best = jobs.reduce((a, b) =>
    (b.results?.length ?? 0) > (a.results?.length ?? 0) ? b : a
  )
  return [best]
}

/** 保留 3～8 条参考链接（结果应已通过 LLM 相关性筛选） */
export function pickSourceLinks(results: SearchResult[]): WebSearchHit[] {
  const pool = results
  const seen = new Set<string>()
  const picked: WebSearchHit[] = []
  for (const r of pool) {
    let host = ''
    try {
      host = new URL(r.url).hostname
    } catch {
      host = r.url
    }
    if (seen.has(host)) continue
    seen.add(host)
    picked.push({ title: r.title, url: r.url, snippet: r.snippet })
    if (picked.length >= SOURCE_MAX) break
  }
  if (picked.length < SOURCE_MIN && pool.length > picked.length) {
    for (const r of pool) {
      if (picked.some(p => p.url === r.url)) continue
      picked.push({ title: r.title, url: r.url, snippet: r.snippet })
      if (picked.length >= SOURCE_MIN || picked.length >= SOURCE_MAX) break
    }
  }
  return picked.slice(0, SOURCE_MAX)
}

export function buildSearchCardCopyText(
  query: string,
  cardBody: string,
  sources: WebSearchHit[],
  error?: string
): string {
  const header = `【检索摘录】${query}\n${'─'.repeat(32)}\n`
  if (error) return `${header}搜索失败：${error}`
  let out = header + cardBody.trim()
  if (sources.length > 0) {
    out +=
      '\n\n' +
      '参考来源：\n' +
      sources.map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}`).join('\n')
  }
  return out
}

async function llmText(
  settings: AppSettings,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const client = createLlmJsonClient(settings)
  return (
    await client.chatCompletionJsonDetailed({
      messages,
      temperature,
      max_tokens: maxTokens
    })
  ).text.trim()
}

/** 摘录正文是否像被截断（缺结论段、未闭合代码块等） */
function looksIncompleteCardBody(text: string): boolean {
  const t = text.trim()
  if (t.length < 120) return false
  if ((t.match(/```/g)?.length ?? 0) % 2 === 1) return true
  if (/核心要点/u.test(t) && !/综合结论|总结/u.test(t)) return true
  if (/[：，、—\-（(]$/.test(t)) return true
  return false
}

const CARD_BODY_INSTRUCTIONS = `请撰写「检索摘录正文」——一份可保存的检索简报，直接、完整地回答用户问题。

结构与篇幅（务必写足，避免一两段敷衍）：
- 全文建议 **500～1200 字**（信息量大时可更长）；分 **3～6 个小节**，每节用简短小标题（可用 **标题** 或 ## 形式）
- 必须包含这些板块（无相关内容则写「检索未提及」并略过）：
  1. **概述**：2～4 句，点明主题与结论
  2. **核心要点**：分条列出（≥4 条为宜），写清特性、原因、影响等具体信息
  3. **版本 / 数据 / 时间线**：版本号、LTS 周期、发布年份、许可证、统计数据等可核对事实
  4. **官方与权威说法**：优先归纳 oracle.com、openjdk、厂商文档、规范/白皮书中的表述（用「据…」概括，不编造出处）
  5. **综合结论**：回扣用户原问（如「为何流行」「有什么区别」）

写作要求：
- **以搜索结果为主要依据**，把摘要里的名词、数字、特性写进正文；可少量补常识，但不得与检索明显矛盾
- 追求 **准确、齐全、偏官方**，少写空话（如「备受关注」「具有重要意义」）
- 多条来源一致则合并；明显分歧可一句带过
- **不要**罗列参考链接（链接单独展示）
- **禁止**推脱式追问（「要不要再搜」「你主要关心哪块」等）`

/** 纸面卡正文：检索简报（准确、齐全、偏官方） */
async function synthesizeCardBody(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  query: string,
  rawResults: SearchResult[],
  intentSummary?: string,
  taskFrame?: UserTaskFrame
): Promise<string> {
  const rawBlock = formatSearchResults(rawResults)
  const intentLine = intentSummary ? `\n【已澄清的检索意图】${intentSummary}\n` : ''
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        ACKEM_PRODUCT_IDENTITY_GUARD +
        buildAckemCompareCardBlock(userQuestion) +
        '\n\n【当前任务】你正在为用户撰写「检索摘录」正文。语气可略带人格色彩，但正文以 **准确、齐全、可核对** 的信息为主，像技术简报而非闲聊。'
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `【检索任务】你刚替用户搜索了「${query}」。${intentLine}` +
        `${recencyPromptSuffix()}\n\n` +
        (rawResults.length === 0
          ? '【说明】联网结果与意图对不上号或未返回可用摘要，请主要依据检索意图与可靠常识撰写摘录，并在概述中简短说明参考链接已省略。\n\n'
          : `以下是搜索引擎返回的原始摘录（仅供你阅读，不要逐条罗列网址）：\n\n${rawBlock}\n\n`) +
        CARD_BODY_INSTRUCTIONS +
        buildCardBodyFormatBlock(taskFrame) +
        '\n\n【格式】正文为 Markdown 纯文本；提到 HTML/JSX 标签时请用反引号包裹（如 `<title>`），不要输出未转义的尖括号标签。'
    }
  ]
  const client = createLlmJsonClient(settings)
  let result = await client.chatCompletionJsonDetailed({
    messages,
    temperature: 0.42,
    max_tokens: CARD_BODY_MAX_TOKENS
  })
  let text = result.text.trim()

  if (result.truncated || looksIncompleteCardBody(text)) {
    messages.push({ role: 'assistant', content: text })
    messages.push({
      role: 'user',
      content:
        '上一段摘录未写完（可能在某条要点中途截断）。请从中断处续写至完整，补全剩余要点与「综合结论」小节；不要重复已有段落。'
    })
    const cont = await client.chatCompletionJsonDetailed({
      messages,
      temperature: 0.42,
      max_tokens: CARD_BODY_MAX_TOKENS
    })
    if (cont.text.trim()) {
      text = `${text}\n\n${cont.text.trim()}`
    }
  }

  return text || '（未能生成摘录正文，请查看下方参考来源。）'
}

/** 聊天气泡：伴侣对搜索主题的看法，不重复纸面卡总结 */
async function synthesizeCompanionReply(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  query: string,
  cardBody: string,
  taskFrame?: UserTaskFrame
): Promise<string> {
  const excerpt = cardBody.length > 500 ? `${cardBody.slice(0, 500)}…` : cardBody
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        ACKEM_PRODUCT_IDENTITY_GUARD +
        buildAckemCompareCardBlock(userQuestion) +
        PAPER_CARD_COMPANION_SYSTEM_SUFFIX +
        '\n\n【当前任务】用户刚让你帮忙搜索，**完整检索简报已在纸面卡**。你只需用伴侣口吻说 **一两句**，**禁止复述** LTS、许可证、特性列表、版本号等事实。'
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `【背景】你刚帮用户搜了「${query}」，摘录已在上方纸面卡。\n` +
        `（仅供把握话题，勿复述）\n${excerpt}\n` +
        '像刚查完资料跟用户说话；例：「上面是刚查到的，有不确定的咱们再对一下」。\n' +
        '- 严格遵守人格、情绪与记忆语境；\n' +
        '- **不要**重复纸面卡里的任何事实、分条总结；\n' +
        '- **不要**罗列链接或再写小百科；\n' +
        '- 禁止推脱式追问。' +
        buildCompanionReplyFormatBlock(taskFrame) +
        buildPaperCardCompanionUserTail('检索摘录', query)
    }
  ]
  const text = await llmText(settings, messages, 320, 0.88)
  const trimmed = text.trim()
  if (!trimmed) return defaultPaperCardCompanionFallback('检索摘录')
  return finalizePaperCardCompanionReply(trimmed)
}

export async function synthesizeSearchExperience(
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: SearchSynthesisInput,
  opts?: { webContents?: WebContents; onStatus?: (text: string) => void }
): Promise<SearchSynthesisOutput> {
  const { query, results, error, intentSummary, taskFrame } = input
  const forSynthesis = error ? [] : prioritizeOfficialResults(results)
  const sources = error ? [] : pickSourceLinks(results)

  const emitTableActivity = async () => {
    if (taskFrame?.delivery === 'markdown_table') {
      await beginMarkdownTableSkillActivity(opts?.webContents, query, opts?.onStatus)
    }
  }

  if (error) {
    const cardBody = `联网搜索失败：${error}`
    const companionReply = '这次连不上搜索，要不稍后再试或换个说法？'
    return {
      cardBody,
      companionReply,
      sources: [],
      copyText: buildSearchCardCopyText(query, cardBody, [], error),
      displayTitle: query
    }
  }

  const systemContext = extractSystemFromMessages(contextMessages)
  const userQuestion = extractLastUserQuestion(contextMessages)
  const cardKind =
    taskFrame?.delivery === 'markdown_table' ? ('table' as const) : ('search' as const)

  const finishOutput = async (
    cardBody: string,
    outSources: WebSearchHit[]
  ): Promise<SearchSynthesisOutput> => {
    const sanitizedBody = sanitizeAckemIdentityInMarkdown(cardBody, userQuestion)
    const displayTitle = await resolvePaperCardDisplayTitle(
      settings,
      cardKind,
      userQuestion,
      query,
      sanitizedBody
    )
    const companionReply = await synthesizeCompanionReply(
      settings,
      systemContext,
      userQuestion,
      displayTitle,
      sanitizedBody,
      taskFrame
    )
    return {
      cardBody: sanitizedBody,
      companionReply,
      sources: outSources,
      copyText: buildSearchCardCopyText(displayTitle, sanitizedBody, outSources),
      displayTitle
    }
  }

  if (results.length === 0) {
    await emitTableActivity()
    const cardBody = await synthesizeCardBody(
      settings,
      systemContext,
      userQuestion,
      query,
      [],
      intentSummary,
      taskFrame
    )
    return finishOutput(cardBody, [])
  }

  await emitTableActivity()
  const cardBody = await synthesizeCardBody(
    settings,
    systemContext,
    userQuestion,
    query,
    forSynthesis,
    intentSummary,
    taskFrame
  )
  return finishOutput(cardBody, sources)
}

export async function runSearchSynthesisChain(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  jobs: SearchSynthesisInput[],
  onStatus?: (text: string) => void
): Promise<string> {
  const mergedJobs = consolidateSearchJobs(jobs)

  let companionReply = ''
  for (const job of mergedJobs) {
    const isTable = job.taskFrame?.delivery === 'markdown_table'
    if (!isTable) {
      const statusLabel = pluginActivityLabel('search_synthesis')
      onStatus?.(statusLabel)
      webContents.send('chat:status', statusLabel)
    }
    const synth = await synthesizeSearchExperience(settings, contextMessages, job, {
      webContents,
      onStatus
    })
    webContents.send(
      'chat:searchCard',
      toSearchCardPayloadFromSynthesis(job.query, synth, job.error)
    )
    companionReply = synth.companionReply
  }
  return companionReply
}

export function toSearchCardPayloadFromSynthesis(
  query: string,
  out: SearchSynthesisOutput,
  error?: string
): SearchCardPayload {
  return {
    query,
    displayTitle: out.displayTitle,
    cardBody: out.cardBody,
    sources: out.sources,
    copyText: out.copyText,
    mode: 'search',
    ...(error ? { error } : {})
  }
}
