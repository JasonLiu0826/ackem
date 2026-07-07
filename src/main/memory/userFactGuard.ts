/** 鐢ㄦ埛浜嬪疄鎶藉彇瀹堝崼锛氬彧浠庣敤鎴疯嚜杩板啓鍏ユ。妗堬紝闂彞/浼翠荆鑷堪涓嶅緱姹℃煋鐢ㄦ埛 BASIC_PROFILE */

const QUESTION_TO_COMPANION_RES = [
  /^浣??:鏄瘄鍙珅璋亅鍚嶅瓧|鐢熸棩|澶氬ぇ|鍑犲瞾|鍝勾)/,
  /^璇烽棶?浣??:鐨??(?:鐢熸棩|鍚嶅瓧|鏄皝)/,
  /浣??:鏄瘄鍙?浠€涔?,
  /鏄皝[鍟婂憖鍚楀憿]?[锛?]?$/,
  /浠€涔堟椂鍊橻鍟婂憖鍚楀憿]?[锛?]?$/,
  /澶氬ぇ[浜哴?[鍟婂憖鍚楀憿]?[锛?]?$/,
]

const INTERROGATIVE_NAME = /^[璋佷粈涔堝暐鍝€庝箞涓轰綍鍑犱釜]+$/u
const REFUSAL_NAME = /^(闅忎究|涓嶆兂|涓嶈|淇濆瘑|涓嶅憡璇変綘|鏃犲彲濂夊憡)/

export function isQuestionToCompanion(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  if (/[锛?]$/.test(t)) return true
  return QUESTION_TO_COMPANION_RES.some((re) => re.test(t))
}

export function userMsgClaimsSelfBirthday(msg: string): boolean {
  return /(?:^|[^浣燷)鎴??:鏈汉)?(?:鐨??鐢熸棩(?:鏄瘄鍦??/u.test(msg) || /\bmy birthday\b/i.test(msg)
}

export function userMsgClaimsSelfName(msg: string): boolean {
  return /(?:鎴??:鍙珅鏄瘄鍚嶅瓧)|鍙垜|浣犲彲浠ュ彨鎴憒澶у閮藉彨鎴憒鍚嶅瓧[鏄彨])/u.test(msg)
}

export function isValidExtractedUserName(name: string, userMsg: string): boolean {
  const n = name.trim()
  if (!n || n.length > 10) return false
  if (INTERROGATIVE_NAME.test(n)) return false
  if (/^[璋佷粈涔堝暐浣犱粬濂筣/u.test(n)) return false
  if (REFUSAL_NAME.test(n)) return false
  if (isQuestionToCompanion(userMsg)) return false
  return true
}

export type GuardableFact = {
  domain?: string
  subcategory: string
  subject: string
  summary: string
}

/** LLM / 瑙勫垯鎶藉彇鍚庝簩娆¤繃婊わ細鐢ㄦ埛妗ｆ鍙帴鍙楃敤鎴疯嚜杩?*/
export function filterExtractedUserFacts<T extends GuardableFact>(
  facts: T[],
  userMsg: string
): T[] {
  const questionTurn = isQuestionToCompanion(userMsg)

  return facts.filter((f) => {
    if (f.subcategory === 'NOTE') return true
    if (f.subcategory === 'OUR_BOND' && f.subject.startsWith('Ackem鍥炲')) return true

    if (questionTurn && f.subcategory === 'BASIC_PROFILE') return false

    if (f.subcategory === 'BASIC_PROFILE') {
      if (f.subject === '鐢ㄦ埛鐢熸棩' && !userMsgClaimsSelfBirthday(userMsg)) return false
      if (
        (f.subject === '鐢ㄦ埛濮撳悕' || f.subject === '鐢ㄦ埛鏄电О') &&
        !userMsgClaimsSelfName(userMsg)
      ) {
        return false
      }
    }

    return true
  })
}
