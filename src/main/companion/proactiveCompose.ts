import { createLlmJsonClient } from '../llmClient'
import { loadState } from '../engine/state-persistence'
import { FactStore, defaultFactsPath } from '../memory/factStore'
import type { AppSettings } from '../settings'
import { getTimeContext } from '../extensions/plugins/builtin/desktop-companion/desktop-companion'
import {
  sanitizeDesktopProactiveMessage,
  templateDesktopProactiveMessage
} from '../extensions/plugins/builtin/desktop-companion/proactiveNotificationMessage'
import { createLogger } from '../logger'
import {
  buildProactivePersonalityBlock,
  pickCompanionProactiveKind,
  pickPersonalityProactiveFallback,
  type ProactiveMessageKind
} from './proactivePersonalityContext'

const log = createLogger('companion-proactive-compose')

export type { ProactiveMessageKind }

export type ComposeCompanionProactiveInput = {
  dataRoot: string
  settings: AppSettings
  sessionId: string
  /** 楠氭壈妯″紡锛氭洿榛忎汉銆佹洿鎾掑▏锛岄棿闅旂敱璋冨害鍣ㄦ帶鍒?*/
  harass?: boolean
}

export function pickRecentFactFromRoot(dataRoot: string): string | null {
  try {
    const store = new FactStore(defaultFactsPath(dataRoot))
    store.load()
    const active = store.listActive()
    if (!active.length) return null
    const sorted = [...active].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    const s = sorted[0]?.summary?.trim()
    return s ? s.slice(0, 48) : null
  } catch {
    return null
  }
}

export { pickCompanionProactiveKind }

const KIND_HINT: Record<ProactiveMessageKind, string> = {
  check_in: '闅忓彛纭瀵规柟鍦ㄤ笉鍦ㄣ€佽繎鍐靛浣?,
  memory_echo: '杞荤偣鎻愯捣瀵规柟涔嬪墠璇磋繃鐨勪簨锛屽儚鐪熺殑璁板緱',
  time_greet: '鎸夊綋鍓嶆椂娈佃嚜鐒舵墦鎷涘懠',
  miss_you: '琛ㄨ揪鎯冲康鎴栨兂鑱婂ぉ锛岀鍚堝叧绯讳翰瀵嗗害',
  playful_nudge: '甯︿竴鐐逛汉鏍肩壒鑹茬殑鎾掑▏/璋冧緝锛屼笉瑕佸鏈嶈厰',
  photo_share: '鍒嗕韩涓€寮犺嚜鎷嶆垨鏃ュ父鐓х墖锛岄檮涓婄畝鐭厤鏂囥€傚繀椤昏皟鐢?agnes_image 宸ュ叿鐢熸垚鍥剧墖銆?
}

async function tryLlmCompanionProactive(args: {
  settings: AppSettings
  relationship: { stage: string; trust: number }
  emotion: { aff: number; primaryLabel?: string; aro?: number; sec?: number }
  fact: string | null
  presetId: string
  kind: ProactiveMessageKind
  harass?: boolean
}): Promise<string | null> {
  try {
    const tc = getTimeContext()
    const llm = createLlmJsonClient(args.settings)
    const personalityBlock = buildProactivePersonalityBlock({
      presetId: args.presetId,
      settings: args.settings,
      aff: args.emotion.aff,
      harass: args.harass
    })
    const factLine = args.fact ? `\n鍙交鐐规彁鍒帮細${args.fact}` : ''
    const topics =
      tc.topicHints.length > 0 ? `\n鏃舵鍙嚜鐒惰亰鍒帮細${tc.topicHints.join('銆?)}` : ''
    const channelLine = args.harass
      ? '浣犺鍦ㄦ闈?Ackem 鑱婂ぉ閲屼富鍔ㄥ彂娑堟伅銆?
      : '鐢ㄦ埛鏆傛椂娌″洖锛屼綘涓诲姩鍙戜竴鏉″井淇°€?

    const formatLine = args.harass
      ? '鍙緭鍑哄鐢ㄦ埛鐩存帴璇寸殑 1锝? 鍙ユ鏂囷紝鎬诲叡 鈮?0 瀛楋紝鍙敤 [SPLIT] 鍒嗕袱鏉°€?
      : '鍙緭鍑?1 鍙ュ鐢ㄦ埛鐩存帴璇寸殑璇濓紝鈮?0 瀛楋紱涓嶈鐢?[SPLIT] 鎴栦换浣曟柟鎷彿鏍囪锛堢郴缁熶細鎸夊彞鑷姩鍒嗘潯鍙戦€侊級銆?

    const request = {
      messages: [
        {
          role: 'system' as const,
          content:
            `浣犳槸 Ackem锛岀敤鎴风殑 AI 浼翠荆銆?{channelLine}\n\n${personalityBlock}\n\n` +
            '绂佹杈撳嚭锛氳瀹氳鏄庛€佺姸鎬佸垎鏋愩€佷换鍔″杩般€佸啓浣滆鍒掋€佹暟瀛楁寚鏍囥€佹嫭鍙峰強鎷彿鍐呮梺鐧姐€佺涓変汉绉板唴蹇冪嫭鐧姐€? +
            `${formatLine} ` +
            '涓嶈瀹㈡湇鑵旓紝涓嶈鎻?DeepSeek/GPT銆?
        },
        {
          role: 'user' as const,
          content:
            `锛堝唴閮ㄥ弬鑰冿紝鍕垮杩帮級鍏崇郴 ${args.relationship.stage}锛沗 +
            `淇′换 ${args.relationship.trust}锛涘ソ鎰?${args.emotion.aff}锛沗 +
            `瀹夊叏鎰?${args.emotion.sec ?? 0}锛沗 +
            `鎯呯华 ${args.emotion.primaryLabel ?? '骞抽潤'}锛?{tc.greeting}銆俙 +
            `浠诲姟锛?{KIND_HINT[args.kind]}銆?{factLine}${topics}\n` +
            '璇风洿鎺ュ啓姝ｆ枃锛?
        }
      ],
      temperature: args.harass ? 0.88 : 0.82,
      max_tokens: 192
    }

    let result = await llm.chatCompletionJsonDetailed(request)
    let cleaned = sanitizeDesktopProactiveMessage(result.text, 120)

    if ((!cleaned || result.truncated) && !args.harass) {
      result = await llm.chatCompletionJsonDetailed({
        ...request,
        temperature: 0.72
      })
      cleaned = sanitizeDesktopProactiveMessage(result.text, 120)
    }

    return cleaned
  } catch (e) {
    log.warn('LLM companion proactive generation failed', { error: String(e) })
    return null
  }
}

export async function composeCompanionProactiveMessage(
  input: ComposeCompanionProactiveInput
): Promise<{ raw: string; kind: ProactiveMessageKind } | null> {
  const state = loadState(input.dataRoot, input.sessionId)
  if (!state) return null
  if (state.relationship.stage === 'STRANGER' && state.relationship.trust < 35) {
    return null
  }

  const presetId = input.settings.personalityPresetId
  const fact = pickRecentFactFromRoot(input.dataRoot)
  const kind = pickCompanionProactiveKind({
    fact,
    aff: state.emotion.aff,
    stage: state.relationship.stage,
    harass: input.harass,
    presetId
  })

  const raw = await tryLlmCompanionProactive({
    settings: input.settings,
    relationship: state.relationship,
    emotion: state.emotion,
    fact,
    presetId,
    kind,
    harass: input.harass
  })

  if (!raw?.trim()) {
    const fallback = pickPersonalityProactiveFallback(
      presetId,
      state.emotion.aff,
      !!input.harass
    )
    if (!fallback) return null
    return { raw: fallback, kind }
  }

  const sanitized = sanitizeDesktopProactiveMessage(raw.trim(), 120)
  if (sanitized) return { raw: sanitized, kind }

  const tc = getTimeContext()
  return { raw: templateDesktopProactiveMessage(tc), kind }
}
