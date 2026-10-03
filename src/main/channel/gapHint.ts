import {
  detectBareFeatureCreateCandidate,
  detectExtensionDemandExplicit
} from '../extensions/dispatch/explicitDispatch'
import {
  isCasualOpinionChat,
  wantsOrganizeAsCard
} from '../extensions/plugins/builtin/knowledge-presentation/intent'

const MIN_PROBE_LEN = 8

const CAPABILITY_GAP_SIGNALS: RegExp[] = [
  /(?:要是|如果|真希望|希望|何时|什么时候).{0,24}(?:就好了|该多好)/,
  /(?:要是能|要是可以|如果能|能不能自动|能不能帮我)/,
  /(?:能不能有个|还缺|缺少|没(?:有)?(?:合适)?的(?:工具|办法|功能|能力))/,
  /(?:总是|老是|每次|天天).{0,16}(?:烦|麻烦|忘|重复|手动|折腾)/,
  /(?:好烦|太麻烦|费劲|费时间|重复劳动|一遍遍)/,
  /(?:提醒我|通知我|帮我记|自动(?:化)?处理)/
]

function isCapabilityMetaQuery(message: string): boolean {
  return (
    /(?:Ackem|你|这边|系统).{0,12}(?:能不能|可不可以|有没有|支持)/u.test(message) &&
    !/(?:要是|烦|麻烦|忘|自动|缺|折腾)/u.test(message)
  )
}

export function shouldSkipCapabilityProbe(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length < MIN_PROBE_LEN) return true
  if (detectExtensionDemandExplicit(trimmed)) return true
  if (wantsOrganizeAsCard(trimmed)) return true
  if (isCasualOpinionChat(trimmed)) return true
  if (isCapabilityMetaQuery(trimmed)) return true
  return false
}

/** 缺口句式。只给诚实护栏用，不选通道，不读向量。 */
export function hasCapabilityGapHint(message: string): boolean {
  const trimmed = message.trim()
  if (detectBareFeatureCreateCandidate(trimmed)) return true
  if (shouldSkipCapabilityProbe(message)) return false
  return CAPABILITY_GAP_SIGNALS.some((re) => re.test(trimmed))
}
