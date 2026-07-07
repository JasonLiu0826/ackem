import {
  detectBareFeatureCreateCandidate,
  detectExtensionDemandExplicit,
  extractBareFeatureCreateTopic
} from '../dispatch/explicitDispatch'
import {
  isCasualOpinionChat,
  wantsOrganizeAsCard
} from '../plugins/builtin/knowledge-presentation/intent'
import { cosineSimilarity } from '../../memory/factEmbeddingCache'

/** @deprecated 鍏煎鏃ф祴璇曞悕锛涜鐢?shouldRunCapabilityProbe */
export type ExtensionIntentClass =
  | 'extension_demand'
  | 'relationship_emotional'
  | 'capability_query'
  | 'chit_chat'
  | 'extension_update'
  | 'content_organize'

export type CapabilityPersistency = 'recurring' | 'one_shot' | 'relational' | 'none'

/** Jarvis 寮忚兘鍔涙帰閽堬細璇勪及銆岀己鍙ｆ槸鍚﹀€煎緱鍋氭垚鍙儴缃?Skill銆?*/
export type CapabilityProbe = {
  capability_gap: number
  implementable_as_skill: number
  persistency: CapabilityPersistency
  suggested_capability?: string
  suggested_name?: string
  should_propose_plan: boolean
  reasoning?: string
}

export type ExtensionIntentClassification = {
  category: ExtensionIntentClass
  confidence: number
  suggested_name?: string
  reasoning?: string
  probe?: CapabilityProbe
}

const MIN_PROBE_LEN = 8

/** 鐢ㄦ埛琛ㄨ揪娴佺▼鎽╂摝 / 鑳藉姏缂哄彛锛堜笉鍐欏叿浣撳姛鑳藉疄浣擄級 */
const CAPABILITY_GAP_SIGNALS: RegExp[] = [
  /(?:瑕佹槸|濡傛灉|鐪熷笇鏈泑甯屾湜|浣曟椂|浠€涔堟椂鍊?.{0,24}(?:灏卞ソ浜唡璇ュ濂?/,
  /(?:瑕佹槸鑳絴瑕佹槸鍙互|濡傛灉鑳絴鑳戒笉鑳借嚜鍔▅鑳戒笉鑳藉府鎴?/,
  /(?:鑳戒笉鑳芥湁涓獆杩樼己|缂哄皯|娌??:鏈??(?:鍚堥€??鐨??:宸ュ叿|鍔炴硶|鍔熻兘|鑳藉姏))/,
  /(?:鎬绘槸|鑰佹槸|姣忔|澶╁ぉ).{0,16}(?:鐑楹荤儲|蹇榺閲嶅|鎵嬪姩|鎶樿吘)/,
  /(?:濂界儲|澶夯鐑璐瑰姴|璐规椂闂磡閲嶅鍔冲姩|涓€閬嶉亶)/,
  /(?:鎻愰啋鎴憒閫氱煡鎴憒甯垜璁皘鑷姩(?:鍖??澶勭悊)/
]

const IMPLICIT_PLAN_THRESHOLD = 0.72
const GAP_MIN = 0.62
const IMPLEMENTABLE_MIN = 0.68

/** 瑙ｆ瀽澶辫触闄嶇骇鏃舵帓闄わ細鎶借薄鎯呮劅/闄即璇夋眰锛堜笉鐢ㄥ叿浣撲汉鐗╁疄浣撹瘝锛?*/
const PARSE_FAIL_RELATIONAL_RE = /(?:闄??:鎴憒浣?|瀛ょ嫭|瀵傚癁|鑴卞崟|鎭嬬埍|濂藉鍗?/u

function isCapabilityMetaQuery(message: string): boolean {
  return (
    /(?:Ackem|浣爘杩欒竟|绯荤粺).{0,12}(?:鑳戒笉鑳絴鍙笉鍙互|鏈夋病鏈墊鏀寔)/u.test(message) &&
    !/(?:瑕佹槸|鐑楹荤儲|蹇榺鑷姩|缂簗鎶樿吘)/u.test(message)
  )
}

/** 蹇矾寰勬帓闄わ細宸茬煡璧板叾瀹冪绾匡紝涓嶅繀璋?LLM */
export function shouldSkipCapabilityProbe(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length < MIN_PROBE_LEN) return true
  if (detectExtensionDemandExplicit(trimmed)) return true
  if (wantsOrganizeAsCard(trimmed)) return true
  if (isCasualOpinionChat(trimmed)) return true
  if (isCapabilityMetaQuery(trimmed)) return true
  return false
}

/** 鏄惁鍊煎緱鍚姩鑳藉姏鎺㈤拡锛堝杩涳細瑁稿姛鑳藉悕 create 鎴栨懇鎿?缂哄彛淇″彿锛涗弗鍑猴細LLM 澶氱淮璇勫垎锛?*/
export function shouldRunCapabilityProbe(
  message: string,
  queryEmbed?: number[],
  createToolAnchor?: number[]
): boolean {
  const trimmed = message.trim()
  if (detectBareFeatureCreateCandidate(trimmed)) return true
  if (shouldSkipCapabilityProbe(message)) return false
  if (CAPABILITY_GAP_SIGNALS.some((re) => re.test(trimmed))) return true

  // Embedding 鍏滃簳锛氳涔夊尮閰?鎯抽€犲伐鍏?鎰忓浘
  if (queryEmbed && createToolAnchor && queryEmbed.length > 0 && createToolAnchor.length > 0) {
    if (cosineSimilarity(queryEmbed, createToolAnchor) > 0.70) return true
  }

  return false
}

export function buildCapabilityProbePrompt(userMessage: string, recentContext: string): string {
  return [
    '浣犳槸 Ackem 鐨?capability probe锛堢被浼?Jarvis 璇勪及鐢ㄦ埛鏄惁缂轰竴涓€屽彲閮ㄧ讲銆佸彲閲嶅璋冪敤銆嶇殑鑷姩鍖栬兘鍔涳級銆?,
    'Companion 鏈綋宸茶礋璐ｏ細瀵硅瘽銆佹儏鎰熼櫔浼淬€佽蹇嗐€佷竴娆℃€х煡璇嗘暣鐞嗙焊闈㈠崱銆佽皟搴﹀凡鏈?Skill銆?,
    '鍙湁銆屽弽澶嶅嚭鐜般€佸彲鐢ㄤ唬鐮?瑙勫垯/瑙﹀彂鍣ㄥ皝瑁呫€嶇殑缂哄彛锛屾墠寤鸿杩涘叆 Plan 寮€鍙戞柊 Skill/鎻掍欢銆?,
    '鍙繑鍥?JSON锛屼笉瑕?markdown銆?,
    '',
    '璇勪及姝ラ锛堝湪 reasoning 閲岀敤涓€鍙ヨ瘽浣撶幇锛夛細',
    '1) 鏄惁瀛樺湪鑳藉姏/娴佺▼缂哄彛锛坈apability_gap锛?,
    '2) 缂哄彛鑳藉惁鐢?Skill/鎻掍欢瀹炵幇锛岃€岄潪闈犺亰澶╂垨鐪熶汉鍏崇郴婊¤冻锛坕mplementable_as_skill锛?,
    '3) 闇€姹傛槸鍙嶅鍙戠敓(recurring)銆佷竴娆℃€?one_shot)銆佸叧绯?鎯呮劅(relational)銆佽繕鏄棤(none)',
    '',
    '瀛楁锛?,
    '{',
    '  "capability_gap": number,          // 0~1',
    '  "implementable_as_skill": number,  // 0~1锛涚函闄即/鎯呮劅/浜洪檯 鈫?鎺ヨ繎 0',
    '  "persistency": "recurring"|"one_shot"|"relational"|"none",',
    '  "suggested_capability": string,    // 涓€鍙ヨ瘽锛屾娊璞℃弿杩扮己鍙ｏ紝鏉ヨ嚜鐢ㄦ埛鍘熻瘽',
    '  "suggested_name": string,          // 2~8 瀛楄兘鍔涘悕锛涗粎 recurring 涓?implementable 楂樻椂濉啓',
    '  "should_propose_plan": boolean,    // 缁煎悎寤鸿鏄惁鍙嶉棶鐢ㄦ埛鍋?Skill',
    '  "reasoning": string',
    '}',
    '',
    '鍘熷垯锛氬畞鍙紡鍒わ紝涓嶈璇垽銆傛儏鎰?闄即/瀛ょ嫭 鈫?relational銆傛暣鐞?鍐欎竴浠?鎬荤粨 鈫?one_shot銆?,
    recentContext ? `鏈€杩戝璇濓細\n${recentContext.slice(0, 400)}` : '',
    `鐢ㄦ埛娑堟伅锛?${userMessage}"`
  ]
    .filter(Boolean)
    .join('\n')
}

export function parseCapabilityProbe(raw: string): CapabilityProbe | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as CapabilityProbe
    if (typeof parsed.capability_gap !== 'number' || typeof parsed.implementable_as_skill !== 'number') {
      return null
    }
    const persistency = parsed.persistency
    if (!['recurring', 'one_shot', 'relational', 'none'].includes(persistency)) return null
    return {
      capability_gap: clamp01(parsed.capability_gap),
      implementable_as_skill: clamp01(parsed.implementable_as_skill),
      persistency,
      suggested_capability: parsed.suggested_capability?.trim() || undefined,
      suggested_name: parsed.suggested_name?.trim() || undefined,
      should_propose_plan: Boolean(parsed.should_propose_plan),
      reasoning: parsed.reasoning
    }
  } catch {
    return null
  }
}

/** @deprecated 鍏煎鏃?category JSON锛涙柊璺緞璇风敤 parseCapabilityProbe */
export function parseIntentClassification(raw: string): ExtensionIntentClassification | null {
  const probe = parseCapabilityProbe(raw)
  if (probe) return evaluateProbeForPlan(probe) ?? probeToNegativeClassification(probe)

  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as ExtensionIntentClassification
    if (!parsed.category || typeof parsed.confidence !== 'number') return null
    return {
      category: parsed.category,
      confidence: clamp01(parsed.confidence),
      suggested_name: parsed.suggested_name?.trim() || undefined,
      reasoning: parsed.reasoning
    }
  } catch {
    return null
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function compositeProbeConfidence(probe: CapabilityProbe): number {
  if (probe.persistency === 'relational' || probe.persistency === 'one_shot') {
    return clamp01(Math.min(probe.capability_gap, probe.implementable_as_skill) * 0.45)
  }
  if (probe.persistency === 'none') {
    return clamp01(probe.capability_gap * 0.35)
  }
  return clamp01(probe.capability_gap * 0.42 + probe.implementable_as_skill * 0.58)
}

function probeToNegativeClassification(probe: CapabilityProbe): ExtensionIntentClassification {
  const category: ExtensionIntentClass =
    probe.persistency === 'relational'
      ? 'relationship_emotional'
      : probe.persistency === 'one_shot'
        ? 'content_organize'
        : probe.persistency === 'none'
          ? 'chit_chat'
          : 'capability_query'
  return {
    category,
    confidence: compositeProbeConfidence(probe),
    reasoning: probe.reasoning,
    probe
  }
}

/** 涓ュ嚭锛氬缁撮棬妲?+ LLM 缁煎悎 flag */
export function shouldProposePlanFromProbe(probe: CapabilityProbe): boolean {
  if (probe.persistency !== 'recurring') return false
  if (probe.capability_gap < GAP_MIN) return false
  if (probe.implementable_as_skill < IMPLEMENTABLE_MIN) return false
  const confidence = compositeProbeConfidence(probe)
  if (confidence < IMPLICIT_PLAN_THRESHOLD) return false
  if (!probe.should_propose_plan && confidence < 0.82) return false
  return true
}

export function evaluateProbeForPlan(probe: CapabilityProbe): ExtensionIntentClassification | null {
  if (!shouldProposePlanFromProbe(probe)) return null
  return {
    category: 'extension_demand',
    confidence: compositeProbeConfidence(probe),
    suggested_name: probe.suggested_name,
    reasoning: probe.reasoning,
    probe
  }
}

export function buildPlanAskMessage(classification: ExtensionIntentClassification): string {
  const name = classification.suggested_name?.trim()
  const capability = classification.probe?.suggested_capability?.trim()
  if (name) {
    return `鍚捣鏉ヤ綘缂轰竴涓€?{name}銆嶈兘鍔涒€斺€旇涓嶈鎴戝府浣犲仛鎴?Skill 鎴栨彃浠讹紵`
  }
  if (capability) {
    return `鍚捣鏉ヤ綘闇€瑕侊細${capability}鈥斺€旇涓嶈鎴戝府浣犲仛鎴?Skill 鎴栨彃浠讹紵`
  }
  return '鍚捣鏉ヤ綘闇€瑕佷竴涓彲閲嶅鐢ㄧ殑灏忚兘鍔涒€斺€旇涓嶈鎴戝府浣犲仛鎴?Skill 鎴栨彃浠讹紵'
}

export async function runCapabilityProbe(
  userMessage: string,
  recentContext: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<CapabilityProbe | null> {
  try {
    const raw = await llmCall(buildCapabilityProbePrompt(userMessage, recentContext))
    return parseCapabilityProbe(raw)
  } catch {
    return null
  }
}

/** 浠庨殣寮忕己鍙ｅ彞寮忔娊鍙栬兘鍔涙弿杩帮紙涓嶅啓姝诲姛鑳藉疄浣撹瘝琛級 */
export function extractImplicitCapabilityHint(message: string): string | undefined {
  const trimmed = message.trim()

  const wish = trimmed.match(/(?:瑕佹槸|濡傛灉|鐪熷笇鏈泑甯屾湜)(.+?)(?:灏卞ソ浜唡璇ュ濂?/u)
  if (wish?.[1]) {
    const hint = sanitizeCapabilityHint(wish[1])
    if (hint.length >= 2) return hint
  }

  const friction = trimmed.match(
    /(?:鎬绘槸|鑰佹槸|姣忔|澶╁ぉ).{0,20}(?:瑕亅寰??(.{2,20}?)(?:锛寍,|銆倈$|澶獆濂?(?:鐑楹荤儲|蹇榺閲嶅|鎵嬪姩|鎶樿吘)/u
  )
  if (friction?.[1]) {
    const hint = sanitizeCapabilityHint(friction[1])
    if (hint.length >= 2) return hint
  }

  const bare = extractBareFeatureCreateTopic(trimmed)
  if (bare) return bare

  return undefined
}

function sanitizeCapabilityHint(raw: string): string {
  return raw
    .replace(/^(?:鑳絴鍙互)?(?:鏈??(?:涓獆涓€涓??/u, '')
    .replace(/[銆傘€屻€?"''\s锛?]+$/gu, '')
    .trim()
}

function shortenCapabilityName(hint: string): string {
  const s = hint.replace(/^(甯垜|缁欐垜|鑷繁|鑷姩)/u, '').trim()
  return (s.length >= 2 ? s : hint).slice(0, 8)
}

/**
 * LLM 鎺㈤拡 JSON 瑙ｆ瀽澶辫触鏃剁殑闄嶇骇锛堜粎缁撴瀯淇″彿 + 鍙ュ紡鎶藉彇锛屼笉鐢ㄥ姛鑳藉疄浣撹瘝琛級銆?
 * 鎯呮劅/闄即绫荤己鍙ｄ粛浼樺厛鐢?LLM 鐨?persistency=relational 鎷︽埅锛涙澶勫彧鍋氳В鏋愬厹搴曘€?
 */
export function buildParseFailureCapabilityProbe(userMessage: string): CapabilityProbe | null {
  const trimmed = userMessage.trim()
  if (!shouldRunCapabilityProbe(trimmed)) return null

  const hint = extractImplicitCapabilityHint(trimmed)
  if (!hint) return null
  if (PARSE_FAIL_RELATIONAL_RE.test(hint)) return null

  return {
    capability_gap: 0.76,
    implementable_as_skill: 0.78,
    persistency: 'recurring',
    suggested_capability: trimmed.slice(0, 48),
    suggested_name: shortenCapabilityName(hint),
    should_propose_plan: true,
    reasoning: 'parse_failure_fallback:structural_hint'
  }
}

/** LLM 宸茶繑鍥?JSON 浣嗘湭杩?composite 闂ㄦ鏃讹紝鑻ユā鍨嬫槑纭?flag 涓旂淮搴﹁揪鏍囧垯浠?propose */
function evaluateProbeWithLlmFlag(probe: CapabilityProbe): ExtensionIntentClassification | null {
  if (probe.persistency !== 'recurring') return null
  if (!probe.should_propose_plan) return null
  if (probe.capability_gap < GAP_MIN || probe.implementable_as_skill < IMPLEMENTABLE_MIN) return null
  return {
    category: 'extension_demand',
    confidence: compositeProbeConfidence(probe),
    suggested_name: probe.suggested_name,
    reasoning: probe.reasoning,
    probe
  }
}

export async function classifyExtensionIntent(
  userMessage: string,
  recentContext: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<ExtensionIntentClassification | null> {
  const probe = await runCapabilityProbe(userMessage, recentContext, llmCall)

  if (probe) {
    const plan = evaluateProbeForPlan(probe)
    if (plan) return plan

    const planFromFlag = evaluateProbeWithLlmFlag(probe)
    if (planFromFlag) return planFromFlag

    if (probe.persistency === 'relational' || probe.persistency === 'one_shot') {
      return probeToNegativeClassification(probe)
    }
  }

  // 浠?JSON 瑙ｆ瀽澶辫触锛氬彞寮忔娊鍙栧厹搴曪紙涓嶇敤鍔熻兘瀹炰綋璇嶈〃锛?
  if (!probe) {
    const fallback = buildParseFailureCapabilityProbe(userMessage)
    if (fallback) {
      const plan = evaluateProbeForPlan(fallback)
      if (plan) return plan
    }
    return null
  }

  return probeToNegativeClassification(probe)
}
