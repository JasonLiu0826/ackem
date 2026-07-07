import type { DispatchCatalogEntry } from '../protocols'
import { messageMatchesKeywords } from './candidateCollector'
import { wantsOrganizeAsCard } from '../plugins/builtin/knowledge-presentation/intent'

/** 鐢ㄦ埛鏄庣‘瑕併€屽仛涓€涓墿灞曞埗鍝併€嶏紝鑰岄潪涓€娆℃€т唬鍔?*/
const CREATE_VERB =
  '(?:甯垜|缁欐垜|甯府鎴?(?:鏉??(?:鍋殀鍐檤鍒涘缓|鍋氫竴涓獆鍐欎釜|寮勪釜|鍋氫釜|寮€鍙憒璁捐|鐢熸垚|鏁??:涓獆涓€涓??)'

/** 鏁存鍓嶇紑椤诲寘鍦ㄥ悓涓€闈炴崟鑾风粍鍐咃紝鍚﹀垯 `\s*` 鍙細鎸傚湪 `/create` 鍒嗘敮涓?*/
const CREATE_TOPIC_PREFIX = `(?:${CREATE_VERB}|(?:(?:鑳戒笉鑳絴鍙笉鍙互|鍙互)(?:鍋殀鍐檤鍒涘缓))|(?:\\/create))`

const CREATE_DEMAND_RE = new RegExp(
  `(?:${CREATE_VERB}|(?:(?:鑳戒笉鑳絴鍙笉鍙互|鍙互)(?:鍋殀鍐檤鍒涘缓|甯垜鍋?)|(?:\\/create\\b))`,
  'i'
)

/** 鎵╁睍鍒跺搧绫诲瀷璇嶏紙鍙弿杩颁骇鐗╁舰鎬侊紝涓嶅啓鍏蜂綋鍔熻兘瀹炰綋濡傜暘鑼勯挓/璁℃椂锛?*/
const EXTENSION_META_RE =
  /\b(skill|uskill|uplugin)\b|鎶€鑳絴鎻掍欢|鎵╁睍(?:妯″潡|鑳藉姏)?|灏忓伐鍏穦鑷姩鍖??:鑳藉姏|宸ュ叿)?|[\u4e00-\u9fff]{2,12}鍣?iu

/** 璇濋鍚庡彲璺熶竴鍙ュ姩鏈?琛ュ厖璇存槑锛堝銆岋紝鎴戣鍗ц柂灏濊儐銆嶏級 */
const CREATE_TOPIC_TAIL = String.raw`(?:[锛?][^锛屻€傦紒锛焅n]{0,48})?`

/** 涓€娆℃€у唴瀹?鏂囨。浠诲姟锛屼笉鏄€屽仛涓€涓彲澶嶇敤鎵╁睍銆?*/
const EPHEMERAL_CONTENT_RE =
  /甯垜(?:鍐檤鏀箌娑﹁壊|缂栬緫|缈昏瘧)|(?:鍐檤鎾板啓|璧疯崏)(?:涓€浠絴涓€涓獆绡??(?:鍛ㄦ姤|鎶ュ憡|閭欢|鏂囨|浣滄枃|鎬荤粨|蹇冨緱)|鏀逛竴涓媩娑﹁壊/

/**
 * 涓?L0.5 鐭ヨ瘑鏁寸悊銆佷竴娆℃€у啓浣滀簰鏂ャ€?
 * 銆屽府鎴戞暣鐞嗕竴涓?React銆嶁啋 绾搁潰鍗★紱銆屽府鎴戝仛涓€涓暣鐞嗙瑪璁扮殑 Skill銆嶁啋 浠嶅彲涓烘墿灞曞垱寤恒€?
 */
export function isExtensionCreateExcluded(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return true
  if (wantsOrganizeAsCard(trimmed)) return true
  if (EPHEMERAL_CONTENT_RE.test(trimmed) && !EXTENSION_META_RE.test(trimmed)) return true
  return false
}

export function detectExtensionDemandExplicit(message: string): boolean {
  const trimmed = message.trim()
  if (!CREATE_DEMAND_RE.test(trimmed)) return false
  if (!EXTENSION_META_RE.test(trimmed)) return false
  if (isExtensionCreateExcluded(trimmed)) return false
  return true
}

/**
 * 鏃犲埗鍝佽瘝浣嗘槑鏄惧湪銆屽仛涓€涓姛鑳?宸ュ叿銆嶏細璧伴殣寮?Capability Probe 鈫?ask_plan銆?
 * 銆屽府鎴戝仛涓€涓暘鑼勯挓銆嶁増銆屽府鎴戝仛涓€涓暘鑼勯挓 Skill銆嶏紝鐢?Ackem 鍙嶉棶纭銆?
 */
export function detectBareFeatureCreateCandidate(message: string): boolean {
  const trimmed = message.trim()
  if (!CREATE_DEMAND_RE.test(trimmed)) return false
  if (EXTENSION_META_RE.test(trimmed)) return false
  if (isExtensionCreateExcluded(trimmed)) return false
  return extractBareFeatureCreateTopic(trimmed) !== undefined
}

/** 浠庛€屽府鎴戝仛/鍋氫竴涓?XXX銆嶏紙鏃?Skill/鎻掍欢鍚庣紑锛夋彁鍙栧姛鑳藉悕 */
export function extractBareFeatureCreateTopic(message: string): string | undefined {
  const trimmed = message.trim()
  const m = trimmed.match(
    new RegExp(
      `${CREATE_TOPIC_PREFIX}\\s*(?:涓€涓獆涓??[銆?']?([^銆屻€?'锛屻€傦紒锛焅\n]{2,16}?)\\s*[銆傦紒锛??]?${CREATE_TOPIC_TAIL}$`,
      'iu'
    )
  )
  if (!m?.[1]) return undefined
  const topic = m[1].replace(/[銆屻€?'"]/g, '').trim()
  if (topic.length >= 2 && topic.length <= 16) return topic
  return undefined
}

/** 浠庢樉寮?create 璇濇湳鎻愬彇宸ヤ綔鍖哄悕绉帮紙濡傘€屽府鎴戝仛涓€涓?XXX Skill銆嶁啋 XXX锛?*/
export function extractExplicitCreateTopic(message: string): string | undefined {
  const trimmed = message.trim()
  const patterns = [
    new RegExp(
      `${CREATE_TOPIC_PREFIX}\\s*(?:涓€涓獆涓??[銆?']?([^銆屻€?'锛屻€傦紒锛焅\n]{2,16}?)\\s*(?:skill|鎶€鑳絴鎻掍欢|鎵╁睍(?:妯″潡|鑳藉姏)?|灏忓伐鍏穦鑷姩鍖?`,
      'iu'
    ),
    new RegExp(
      `${CREATE_TOPIC_PREFIX}\\s*(?:涓€涓獆涓??[銆?']?([\\u4e00-\\u9fff]{2,14}鍣?\\s*[銆傦紒锛??]?${CREATE_TOPIC_TAIL}$`,
      'iu'
    ),
    /\/create\s+(.{2,16})/i
  ]
  for (const re of patterns) {
    const m = trimmed.match(re)
    if (!m?.[1]) continue
    const topic = m[1]
      .replace(/[銆屻€?'"]/g, '')
      .trim()
    if (topic.length >= 2 && topic.length <= 16) return topic
  }
  return undefined
}

const INVOKE_PREFIX_RE = /^(鎵撳紑|鍚姩|寮€濮媩杩愯|鍚敤|浣跨敤|璋冪敤|鎼滅储|鎼滀竴涓媩鏌ヤ竴涓?/

export function matchExplicitInvoke(
  message: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry | undefined {
  const trimmed = message.trim()
  if (!INVOKE_PREFIX_RE.test(trimmed) && !messageMatchesKeywords(trimmed, ['鎼滅储', '鎼滀竴涓?, '鏌ヤ竴涓?])) {
    return undefined
  }

  for (const entry of catalog) {
    if (entry.status !== 'active') continue
    if (entry.rejectedInSession) continue

    const habitHits = entry.dispatch.habits.some((habit) => {
      const tokens = habit.match(/['銆宂([^'銆峕+)['銆峕/g)
      if (tokens) {
        return tokens.some((t) => trimmed.includes(t.replace(/['銆屻€峕/g, '')))
      }
      return trimmed.includes(habit.slice(0, Math.min(8, habit.length)))
    })

    if (habitHits) return entry
    if (messageMatchesKeywords(trimmed, entry.dispatch.keywords)) return entry
  }

  return undefined
}
