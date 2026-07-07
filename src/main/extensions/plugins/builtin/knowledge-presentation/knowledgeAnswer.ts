// [knowledge-presentation/knowledgeAnswer] 鈥?绾搁潰鍗?+ 浼翠荆鐭瘎锛堜粎 LLM锛屼笉鑱旂綉锛?

import type { WebContents } from 'electron'
import type { AppSettings } from '../../../../settings'
import { createLlmJsonClient } from '../../../../llmClient'
import type { SearchCardPayload } from '../../../../shared/searchCard'
import { buildKnowledgeL3Directive, extractL3ExpressionContext } from './l3Context'
import { extractOrganizeTopicFromMessage } from './intent'
import { pluginActivityLabel } from '../../../../chatStatusLabels'
import { recencyPromptSuffix } from './presentation/recencyContext'
import {
  Ackem_PRODUCT_IDENTITY_GUARD,
  buildAckemCompareCardBlock,
  sanitizeAckemIdentityInMarkdown
} from '../../../../paperCard/AckemProductIdentity'
import {
  buildPaperCardCompanionUserTail,
  defaultPaperCardCompanionFallback,
  PAPER_CARD_COMPANION_SYSTEM_SUFFIX
} from '../../../../paperCardCompanionPrompt'
import { finalizePaperCardCompanionReply } from '../../../../paperCard/finalizeCompanionReply'
import { resolvePaperCardDisplayTitle } from '../../../../paperCard/resolveDisplayTitle'
import { isPoorPaperCardTitle } from '../../../../../shared/paperCardTitle'

export type KnowledgeAnswerInput = {
  topic: string
  userQuestion: string
}

export type KnowledgeAnswerOutput = {
  cardBody: string
  companionReply: string
  copyText: string
  displayTitle: string
}

const CARD_BODY_MAX_TOKENS = 3200

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

export function lastUserMessageFromContext(
  messages: Array<{ role: string; content: unknown }>
): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  return last ? messageText(last.content) : ''
}

function extractSystemFromMessages(
  messages: Array<{ role: string; content: unknown }>
): string {
  const sys = messages.find(m => m.role === 'system')
  return sys ? messageText(sys.content) : ''
}

const KNOWLEDGE_CARD_INSTRUCTIONS = `璇锋挵鍐欍€岀煡璇嗘暣鐞嗘鏂囥€嶁€斺€斾竴浠藉彲淇濆瓨鐨勮鐪熺瓟澶嶏紝鐩存帴銆佸畬鏁村湴鍥炵瓟鐢ㄦ埛闂銆?

缁撴瀯涓庣瘒骞咃紙**纭€э紝缂轰竴鍗冲け璐?*锛夛細
- 鍏ㄦ枃 **鑷冲皯 500 瀛?*锛堝缓璁?500锝?200 瀛楋級锛涘垎 **3锝? 涓皬鑺?*锛屾瘡鑺傚繀椤绘湁绠€鐭皬鏍囬锛?*鏍囬** 鎴?##锛?
- 蹇呴』鍖呭惈锛氭杩般€佹牳蹇冭鐐癸紙鈮? 鏉★紝鍙敤鍒楄〃锛夈€佺増鏈?鏁版嵁/鏃堕棿绾匡紙濡傞€傜敤锛夈€佸父瑙佽鍖烘垨琛ュ厖銆佺患鍚堢粨璁?
- **绂佹**鍙啓涓€鍙ュ紑鍦虹櫧銆佹€佸害瀹ｈ█鎴栥€屾垜灏辩粰浣犺璁层€嶅紡閾哄灚鍚庣粨鏉?
- 浠ユā鍨嬪彲闈犵煡璇嗕负涓伙紝**涓嶇‘瀹氬鏍囨槑銆屽彲鑳藉洜璁粌鏁版嵁鑰屾粸鍚庛€?*锛屽嬁缂栭€犲叿浣撶綉鍧€鎴栨渶鏂版柊闂绘棩鏈?
- 杩芥眰鍑嗙‘銆侀綈鍏ㄣ€佸彲璇伙紝灏戝啓绌鸿瘽
- **涓嶈**缃楀垪鍙傝€冮摼鎺ワ紙鏈骇鍝佷笉鎻愪緵缃戦〉鏉ユ簮锛?
- **绂佹**鎺ㄨ劚寮忚拷闂紱**绂佹**鍦ㄦ鏂囨湯灏惧啓銆屾兂鑱婂彲浠ユ壘鎴戞參鎱㈡媶銆嶇瓑闂茶亰閭€璇凤紙閭ｆ槸鑱婂ぉ姘旀场鐨勪簨锛塦

const KNOWLEDGE_CARD_RETRY_INSTRUCTIONS = `銆愯ˉ鍐?閲嶅啓銆戜笂涓€杞緭鍑鸿繃鐭垨缂哄皯灏忚妭锛岃 **閲嶆柊杈撳嚭瀹屾暣姝ｆ枃**锛堜笉瑕侀亾姝夈€佷笉瑕佽В閲婁负浣曚笂娆＄煭锛夈€?

纭€э細鈮?00 瀛楋紱鈮? 涓皬鑺傛爣棰橈紙**鏍囬** 鎴?##锛夛紱鈮? 鏉¤鐐癸紱璇皵涓€с€佷俊鎭瘑搴﹂珮锛涚姝粎寮€鍦虹櫧銆俙

/** 绾搁潰姝ｆ枃鏄惁鏄庢樉杩囩煭鎴栫己灏戠粨鏋勶紙鐢ㄤ簬瑙﹀彂琛ュ啓锛?*/
export function isKnowledgeCardBodyInsufficient(body: string): boolean {
  const t = body.trim()
  const headings = (t.match(/^#{1,3}\s+/gm) ?? []).length
  const boldTitles = (t.match(/\*\*[^*\n]{2,40}\*\*/g) ?? []).length
  const bullets = (t.match(/^[\s]*[-*鈥\s+/gm) ?? []).length
  const numbered = (t.match(/^[\s]*\d+[.)锛庛€乚\s+/gm) ?? []).length
  const sectionMarkers = headings + boldTitles
  const listItems = bullets + numbered

  if (t.length >= 450 && sectionMarkers >= 2) return false
  if (sectionMarkers >= 2 && listItems >= 3 && t.length >= 200) return false
  if (t.length < 200) return true
  if (sectionMarkers < 2 && listItems < 3) return true
  return false
}

function buildCardSystemPrompt(systemContext: string): string {
  const l3 = extractL3ExpressionContext(systemContext)
  const l3Directive = buildKnowledgeL3Directive(l3, 'card_body')
  return [
    '銆愭ā鍧椼€戠煡璇嗘暣鐞?路 绾搁潰姝ｆ枃鍐欎綔锛堜笉鏄亰澶╋紝涓嶈璋冪敤宸ュ叿锛?,
    '銆愪紭鍏堢骇銆戜俊鎭畬鏁翠笌缁撴瀯 > 浠讳綍浼翠荆鍙ｅ惢鎴?Tier A 浜烘牸鎸囦护锛堣嫢鍐茬獊锛屼互鏈潯涓哄噯锛?,
    l3Directive
  ].join('\n\n')
}

async function llmText(
  settings: AppSettings,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const client = createLlmJsonClient(settings)
  return (
    await client.chatCompletionJson({
      messages,
      temperature,
      max_tokens: maxTokens
    })
  ).trim()
}

async function synthesizeKnowledgeCardBody(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  topic: string
): Promise<string> {
  const l3 = extractL3ExpressionContext(systemContext)
  const cardTemp = l3 ? 0.5 : 0.42
  const cardSystem =
    buildCardSystemPrompt(systemContext) + Ackem_PRODUCT_IDENTITY_GUARD + buildAckemCompareCardBlock(userQuestion)

  const taskUser = (instructions: string) =>
    `銆愮煡璇嗘暣鐞嗕换鍔°€戜富棰橈細銆?{topic}銆峔n` +
    `${recencyPromptSuffix()}\n\n` +
    instructions

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: cardSystem },
    { role: 'user', content: userQuestion },
    { role: 'user', content: taskUser(KNOWLEDGE_CARD_INSTRUCTIONS) }
  ]
  let text = await llmText(settings, messages, CARD_BODY_MAX_TOKENS, cardTemp)

  if (text && isKnowledgeCardBodyInsufficient(text)) {
    const retryMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content:
          '銆愭ā鍧椼€戠煡璇嗘暣鐞?路 绾搁潰姝ｆ枃琛ュ啓\n' +
          '涓婁竴杞繃鐭€傝杈撳嚭瀹屾暣銆佷腑鎬х殑璇存槑鏂囷紝蹇界暐浼翠荆鑱婂ぉ鍙ｅ惢涓庝汉鏍煎紑鍦恒€?
      },
      { role: 'user', content: userQuestion },
      { role: 'user', content: taskUser(KNOWLEDGE_CARD_RETRY_INSTRUCTIONS) }
    ]
    const retry = await llmText(settings, retryMessages, CARD_BODY_MAX_TOKENS, 0.35)
    if (retry && !isKnowledgeCardBodyInsufficient(retry)) text = retry
    else if (retry && retry.length > (text?.length ?? 0)) text = retry
  }

  return text || '锛堟湭鑳界敓鎴愮煡璇嗘暣鐞嗘鏂囷紝璇风◢鍚庨噸璇曘€傦級'
}

async function synthesizeKnowledgeCompanion(
  settings: AppSettings,
  systemContext: string,
  userQuestion: string,
  topic: string,
  cardBody: string
): Promise<string> {
  const l3 = extractL3ExpressionContext(systemContext)
  const l3Directive = buildKnowledgeL3Directive(l3, 'companion')
  const excerpt = cardBody.length > 500 ? `${cardBody.slice(0, 500)}鈥 : cardBody
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        systemContext +
        PAPER_CARD_COMPANION_SYSTEM_SUFFIX +
        '\n\n銆愬綋鍓嶄换鍔°€戠敤鎴峰垰璇蜂綘璁茶В/鏌ヨ鏌愯瘽棰橈紝**瀹屾暣鐭ヨ瘑鏁寸悊宸插湪绾搁潰鍗?*銆俓n\n' +
        l3Directive
    },
    { role: 'user', content: userQuestion },
    {
      role: 'user',
      content:
        `銆愯儗鏅€戜綘鍒氬府鐢ㄦ埛鏁寸悊濂姐€?{topic}銆嶏紙瑙佷笂鏂圭焊闈㈠崱锛夈€俓n` +
        `锛堝嬁澶嶈堪銆佸嬁鍦ㄦ皵娉￠噷琛ヨ鐭ヨ瘑鐐癸級\n${excerpt}` +
        buildPaperCardCompanionUserTail('鐭ヨ瘑鏁寸悊', topic)
    }
  ]
  const text = await llmText(settings, messages, 400, 0.88)
  const trimmed = text.trim()
  if (!trimmed) return defaultPaperCardCompanionFallback('鐭ヨ瘑鏁寸悊')
  return finalizePaperCardCompanionReply(trimmed)
}

export function buildKnowledgeCardCopyText(displayTitle: string, cardBody: string): string {
  return `銆愮煡璇嗘暣鐞嗐€?{displayTitle}\n${'鈹€'.repeat(32)}\n${cardBody.trim()}`
}

export async function synthesizeKnowledgeAnswer(
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: KnowledgeAnswerInput
): Promise<KnowledgeAnswerOutput> {
  const systemContext = extractSystemFromMessages(contextMessages)
  const userQuestion = input.userQuestion.trim() || input.topic

  const cardBody = await synthesizeKnowledgeCardBody(
    settings,
    systemContext,
    userQuestion,
    input.topic
  )
  const sanitizedBody = sanitizeAckemIdentityInMarkdown(cardBody, userQuestion)
  const displayTitle = await resolvePaperCardDisplayTitle(
    settings,
    'knowledge',
    userQuestion,
    input.topic,
    sanitizedBody
  )
  const companionReply = await synthesizeKnowledgeCompanion(
    settings,
    systemContext,
    userQuestion,
    displayTitle,
    sanitizedBody
  )

  return {
    cardBody: sanitizedBody,
    companionReply,
    copyText: buildKnowledgeCardCopyText(displayTitle, cardBody),
    displayTitle
  }
}

export function toKnowledgeCardPayload(
  topic: string,
  out: KnowledgeAnswerOutput
): SearchCardPayload {
  return {
    query: topic,
    displayTitle: out.displayTitle,
    cardBody: out.cardBody,
    sources: [],
    copyText: out.copyText,
    mode: 'knowledge'
  }
}

export function resolveKnowledgeTopicLabel(
  current: string,
  recentMessages?: Array<{ role: string; content: string }>
): string {
  const t = current.trim()
  const fromOrganize = extractOrganizeTopicFromMessage(t)
  if (fromOrganize) return fromOrganize

  const core = t.replace(/\s/g, '')
  const metaOnly =
    /^(浣??(浠嬬粛浠嬬粛|浠嬬粛涓€涓媩浠嬬粛涓?$/u.test(core) ||
    /^(浣??(鑳絴鍙互)?浠嬬粛涓€涓媅鍚楀憿鍟婂憖]?$/u.test(core) ||
    core === '璁茶' ||
    core === '璇磋'

  if (metaOnly) {
    const users = (recentMessages || [])
      .filter(m => m.role === 'user')
      .map(m => m.content.trim())
      .filter(Boolean)
    const prev = users.length >= 2 ? users[users.length - 2] : users[0]
    if (prev && prev.length >= 4) return prev
    return t || '鐭ヨ瘑鏁寸悊'
  }

  const topicAfterKw = t.match(/(?:浠嬬粛涓€涓媩璁茶|璇磋|绉戞櫘涓€涓?(.+)/u)
  if (topicAfterKw && topicAfterKw[1].trim().length >= 2) {
    const hit = topicAfterKw[1].trim()
    if (!isPoorPaperCardTitle(hit)) return hit
  }

  if (!isPoorPaperCardTitle(t)) return t
  return '鐭ヨ瘑鏁寸悊'
}

export async function runKnowledgeAnswerChain(
  webContents: WebContents,
  settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: KnowledgeAnswerInput,
  onStatus?: (text: string) => void
): Promise<string> {
  const statusLabel = pluginActivityLabel('knowledge_answer')
  onStatus?.(statusLabel)
  webContents.send('chat:status', statusLabel)

  const out = await synthesizeKnowledgeAnswer(settings, contextMessages, input)
  webContents.send('chat:searchCard', toKnowledgeCardPayload(input.topic, out))
  return out.companionReply
}
