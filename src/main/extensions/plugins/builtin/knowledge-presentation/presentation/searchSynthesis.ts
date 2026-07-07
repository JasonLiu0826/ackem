// [searchSynthesis] 鈥?鎼滅储鍚庯細绾搁潰鍗℃鏂囨€荤粨 + 浼翠荆鍙ｅ惢鐭瘎锛堟帴鍏?context 閲岀殑浜烘牸/鎯呯华/璁板繂锛?

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
  Ackem_PRODUCT_IDENTITY_GUARD,
  buildAckemCompareCardBlock,
  sanitizeAckemIdentityInMarkdown
} from '../../../../../paperCard/AckemProductIdentity'

export type SearchSynthesisInput = {
  query: string
  results: SearchResult[]
  error?: string
  /** LLM 婢勬竻鍚庣殑妫€绱㈡剰鍥撅紙鎽樺綍涓庢潵婧愮瓫閫夊凡鐢ㄨ繃锛?*/
  intentSummary?: string
  /** L0 鐢ㄦ埛浠诲姟妗嗭紙浜や粯褰㈡€侊級 */
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

/** 鎽樺綍姝ｆ枃鐢熸垚涓婇檺锛堝亸闀裤€佸亸鍏級 */
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

/** 瀹樻柟/鏂囨。绫绘潵婧愪紭鍏堬紝渚涙憳褰曞悎鎴愰槄璇?*/
export function prioritizeOfficialResults(results: SearchResult[]): SearchResult[] {
  const score = (r: SearchResult): number => {
    const blob = `${r.url} ${r.title} ${r.snippet}`
    let s = 0
    for (const p of OFFICIAL_HOST_PATTERNS) {
      if (p.test(blob)) s += 12
    }
    if (/docs?\.|documentation|瀹樻柟|release notes|whitepaper|specification/i.test(blob)) s += 6
    if (/blog|璁哄潧|闂瓟|鐭ヤ箮|璐村惂|鑷獟浣?i.test(blob)) s -= 3
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

/** 鍚岃疆浠呬繚鐣欎竴鏉℃悳绱换鍔★紙鎰忓浘婢勬竻鍚庡簲宸插悎骞讹級 */
export function consolidateSearchJobs(jobs: SearchSynthesisInput[]): SearchSynthesisInput[] {
  if (jobs.length <= 1) return jobs
  const best = jobs.reduce((a, b) =>
    (b.results?.length ?? 0) > (a.results?.length ?? 0) ? b : a
  )
  return [best]
}

/** 淇濈暀 3锝? 鏉″弬鑰冮摼鎺ワ紙缁撴灉搴斿凡閫氳繃 LLM 鐩稿叧鎬х瓫閫夛級 */
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
  const header = `銆愭绱㈡憳褰曘€?{query}\n${'鈹€'.repeat(32)}\n`
  if (error) return `${header}鎼滅储澶辫触锛?{error}`
  let out = header + cardBody.trim()
  if (sources.length > 0) {
    out +=
      '\n\n' +
      '鍙傝€冩潵婧愶細\n' +
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

/** 鎽樺綍姝ｆ枃鏄惁鍍忚鎴柇锛堢己缁撹娈点€佹湭闂悎浠ｇ爜鍧楃瓑锛?*/
function looksIncompleteCardBody(text: string): boolean {
  const t = text.trim()
  if (t.length < 120) return false
  if ((t.match(/```/g)?.length ?? 0) % 2 === 1) return true
  if (/鏍稿績瑕佺偣/u.test(t) && !/缁煎悎缁撹|鎬荤粨/u.test(t)) return true
  if (/[锛氾紝銆佲€擻-锛?]$/.test(t)) return true
  return false
}

const CARD_BODY_INSTRUCTIONS = `璇锋挵鍐欍€屾绱㈡憳褰曟鏂囥€嶁€斺€斾竴浠藉彲淇濆瓨鐨勬绱㈢畝鎶ワ紝鐩存帴銆佸畬鏁村湴鍥炵瓟鐢ㄦ埛闂銆?

缁撴瀯涓庣瘒骞咃紙鍔″繀鍐欒冻锛岄伩鍏嶄竴涓ゆ鏁疯锛夛細
- 鍏ㄦ枃寤鸿 **500锝?200 瀛?*锛堜俊鎭噺澶ф椂鍙洿闀匡級锛涘垎 **3锝? 涓皬鑺?*锛屾瘡鑺傜敤绠€鐭皬鏍囬锛堝彲鐢?**鏍囬** 鎴?## 褰㈠紡锛?
- 蹇呴』鍖呭惈杩欎簺鏉垮潡锛堟棤鐩稿叧鍐呭鍒欏啓銆屾绱㈡湭鎻愬強銆嶅苟鐣ヨ繃锛夛細
  1. **姒傝堪**锛?锝? 鍙ワ紝鐐规槑涓婚涓庣粨璁?
  2. **鏍稿績瑕佺偣**锛氬垎鏉″垪鍑猴紙鈮? 鏉′负瀹滐級锛屽啓娓呯壒鎬с€佸師鍥犮€佸奖鍝嶇瓑鍏蜂綋淇℃伅
  3. **鐗堟湰 / 鏁版嵁 / 鏃堕棿绾?*锛氱増鏈彿銆丩TS 鍛ㄦ湡銆佸彂甯冨勾浠姐€佽鍙瘉銆佺粺璁℃暟鎹瓑鍙牳瀵逛簨瀹?
  4. **瀹樻柟涓庢潈濞佽娉?*锛氫紭鍏堝綊绾?oracle.com銆乷penjdk銆佸巶鍟嗘枃妗ｃ€佽鑼?鐧界毊涔︿腑鐨勮〃杩帮紙鐢ㄣ€屾嵁鈥︺€嶆鎷紝涓嶇紪閫犲嚭澶勶級
  5. **缁煎悎缁撹**锛氬洖鎵ｇ敤鎴峰師闂紙濡傘€屼负浣曟祦琛屻€嶃€屾湁浠€涔堝尯鍒€嶏級

鍐欎綔瑕佹眰锛?
- **浠ユ悳绱㈢粨鏋滀负涓昏渚濇嵁**锛屾妸鎽樿閲岀殑鍚嶈瘝銆佹暟瀛椼€佺壒鎬у啓杩涙鏂囷紱鍙皯閲忚ˉ甯歌瘑锛屼絾涓嶅緱涓庢绱㈡槑鏄剧煕鐩?
- 杩芥眰 **鍑嗙‘銆侀綈鍏ㄣ€佸亸瀹樻柟**锛屽皯鍐欑┖璇濓紙濡傘€屽鍙楀叧娉ㄣ€嶃€屽叿鏈夐噸瑕佹剰涔夈€嶏級
- 澶氭潯鏉ユ簮涓€鑷村垯鍚堝苟锛涙槑鏄惧垎姝у彲涓€鍙ュ甫杩?
- **涓嶈**缃楀垪鍙傝€冮摼鎺ワ紙閾炬帴鍗曠嫭灞曠ず锛?
- **绂佹**鎺ㄨ劚寮忚拷闂紙銆岃涓嶈鍐嶆悳銆嶃€屼綘涓昏鍏冲績鍝潡銆嶇瓑锛塦

/** 绾搁潰鍗℃鏂囷細妫€绱㈢畝鎶ワ紙鍑嗙‘銆侀綈鍏ㄣ€佸亸瀹樻柟锛?*/
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
  const intentLine = intentSummary ? `\n銆愬凡婢勬竻鐨勬绱㈡剰鍥俱€?{intentSummary}\n` : ''
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        Ackem_PRODUCT_IDENTITY_GUARD +
        buildAckemCompareCardBlock(userQuestion) +
        '\n\n銆愬綋鍓嶄换鍔°€戜綘姝ｅ湪涓虹敤鎴锋挵鍐欍€屾绱㈡憳褰曘€嶆鏂囥€傝姘斿彲鐣ュ甫浜烘牸鑹插僵锛屼絾姝ｆ枃浠?**鍑嗙‘銆侀綈鍏ㄣ€佸彲鏍稿** 鐨勪俊鎭负涓伙紝鍍忔妧鏈畝鎶ヨ€岄潪闂茶亰銆?
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `銆愭绱换鍔°€戜綘鍒氭浛鐢ㄦ埛鎼滅储浜嗐€?{query}銆嶃€?{intentLine}` +
        `${recencyPromptSuffix()}\n\n` +
        (rawResults.length === 0
          ? '銆愯鏄庛€戣仈缃戠粨鏋滀笌鎰忓浘瀵逛笉涓婂彿鎴栨湭杩斿洖鍙敤鎽樿锛岃涓昏渚濇嵁妫€绱㈡剰鍥句笌鍙潬甯歌瘑鎾板啓鎽樺綍锛屽苟鍦ㄦ杩颁腑绠€鐭鏄庡弬鑰冮摼鎺ュ凡鐪佺暐銆俓n\n'
          : `浠ヤ笅鏄悳绱㈠紩鎿庤繑鍥炵殑鍘熷鎽樺綍锛堜粎渚涗綘闃呰锛屼笉瑕侀€愭潯缃楀垪缃戝潃锛夛細\n\n${rawBlock}\n\n`) +
        CARD_BODY_INSTRUCTIONS +
        buildCardBodyFormatBlock(taskFrame) +
        '\n\n銆愭牸寮忋€戞鏂囦负 Markdown 绾枃鏈紱鎻愬埌 HTML/JSX 鏍囩鏃惰鐢ㄥ弽寮曞彿鍖呰９锛堝 `<title>`锛夛紝涓嶈杈撳嚭鏈浆涔夌殑灏栨嫭鍙锋爣绛俱€?
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
        '涓婁竴娈垫憳褰曟湭鍐欏畬锛堝彲鑳藉湪鏌愭潯瑕佺偣涓€旀埅鏂級銆傝浠庝腑鏂缁啓鑷冲畬鏁达紝琛ュ叏鍓╀綑瑕佺偣涓庛€岀患鍚堢粨璁恒€嶅皬鑺傦紱涓嶈閲嶅宸叉湁娈佃惤銆?
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

  return text || '锛堟湭鑳界敓鎴愭憳褰曟鏂囷紝璇锋煡鐪嬩笅鏂瑰弬鑰冩潵婧愩€傦級'
}

/** 鑱婂ぉ姘旀场锛氫即渚ｅ鎼滅储涓婚鐨勭湅娉曪紝涓嶉噸澶嶇焊闈㈠崱鎬荤粨 */
async function synthesizeCompanionReply(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  query: string,
  cardBody: string,
  taskFrame?: UserTaskFrame
): Promise<string> {
  const excerpt = cardBody.length > 500 ? `${cardBody.slice(0, 500)}鈥 : cardBody
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        Ackem_PRODUCT_IDENTITY_GUARD +
        buildAckemCompareCardBlock(userQuestion) +
        PAPER_CARD_COMPANION_SYSTEM_SUFFIX +
        '\n\n銆愬綋鍓嶄换鍔°€戠敤鎴峰垰璁╀綘甯繖鎼滅储锛?*瀹屾暣妫€绱㈢畝鎶ュ凡鍦ㄧ焊闈㈠崱**銆備綘鍙渶鐢ㄤ即渚ｅ彛鍚昏 **涓€涓ゅ彞**锛?*绂佹澶嶈堪** LTS銆佽鍙瘉銆佺壒鎬у垪琛ㄣ€佺増鏈彿绛変簨瀹炪€?
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `銆愯儗鏅€戜綘鍒氬府鐢ㄦ埛鎼滀簡銆?{query}銆嶏紝鎽樺綍宸插湪涓婃柟绾搁潰鍗°€俓n` +
        `锛堜粎渚涙妸鎻¤瘽棰橈紝鍕垮杩帮級\n${excerpt}\n` +
        '鍍忓垰鏌ュ畬璧勬枡璺熺敤鎴疯璇濓紱渚嬶細銆屼笂闈㈡槸鍒氭煡鍒扮殑锛屾湁涓嶇‘瀹氱殑鍜变滑鍐嶅涓€涓嬨€嶃€俓n' +
        '- 涓ユ牸閬靛畧浜烘牸銆佹儏缁笌璁板繂璇锛沑n' +
        '- **涓嶈**閲嶅绾搁潰鍗￠噷鐨勪换浣曚簨瀹炪€佸垎鏉℃€荤粨锛沑n' +
        '- **涓嶈**缃楀垪閾炬帴鎴栧啀鍐欏皬鐧剧锛沑n' +
        '- 绂佹鎺ㄨ劚寮忚拷闂€? +
        buildCompanionReplyFormatBlock(taskFrame) +
        buildPaperCardCompanionUserTail('妫€绱㈡憳褰?, query)
    }
  ]
  const text = await llmText(settings, messages, 320, 0.88)
  const trimmed = text.trim()
  if (!trimmed) return defaultPaperCardCompanionFallback('妫€绱㈡憳褰?)
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
    const cardBody = `鑱旂綉鎼滅储澶辫触锛?{error}`
    const companionReply = '杩欐杩炰笉涓婃悳绱紝瑕佷笉绋嶅悗鍐嶈瘯鎴栨崲涓娉曪紵'
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
