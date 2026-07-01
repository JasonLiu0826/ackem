/** 用户事实抽取守卫：只从用户自述写入档案，问句/伴侣自述不得污染用户 BASIC_PROFILE */

const QUESTION_TO_COMPANION_RES = [
  /^你(?:是|叫|谁|名字|生日|多大|几岁|哪年)/,
  /^请问?你(?:的)?(?:生日|名字|是谁)/,
  /你(?:是|叫)什么/,
  /是谁[啊呀吗呢]?[？?]?$/,
  /什么时候[啊呀吗呢]?[？?]?$/,
  /多大[了]?[啊呀吗呢]?[？?]?$/,
]

const INTERROGATIVE_NAME = /^[谁什么啥哪怎么为何几个]+$/u
const REFUSAL_NAME = /^(随便|不想|不说|保密|不告诉你|无可奉告)/

export function isQuestionToCompanion(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  if (/[？?]$/.test(t)) return true
  return QUESTION_TO_COMPANION_RES.some((re) => re.test(t))
}

export function userMsgClaimsSelfBirthday(msg: string): boolean {
  return /(?:^|[^你])我(?:本人)?(?:的)?生日(?:是|在)?/u.test(msg) || /\bmy birthday\b/i.test(msg)
}

export function userMsgClaimsSelfName(msg: string): boolean {
  return /(?:我(?:叫|是|名字)|叫我|你可以叫我|大家都叫我|名字[是叫])/u.test(msg)
}

export function isValidExtractedUserName(name: string, userMsg: string): boolean {
  const n = name.trim()
  if (!n || n.length > 10) return false
  if (INTERROGATIVE_NAME.test(n)) return false
  if (/^[谁什么啥你他她]/u.test(n)) return false
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

/** LLM / 规则抽取后二次过滤：用户档案只接受用户自述 */
export function filterExtractedUserFacts<T extends GuardableFact>(
  facts: T[],
  userMsg: string
): T[] {
  const questionTurn = isQuestionToCompanion(userMsg)

  return facts.filter((f) => {
    if (f.subcategory === 'NOTE') return true
    if (f.subcategory === 'OUR_BOND' && f.subject.startsWith('Ackem回复')) return true

    if (questionTurn && f.subcategory === 'BASIC_PROFILE') return false

    if (f.subcategory === 'BASIC_PROFILE') {
      if (f.subject === '用户生日' && !userMsgClaimsSelfBirthday(userMsg)) return false
      if (
        (f.subject === '用户姓名' || f.subject === '用户昵称') &&
        !userMsgClaimsSelfName(userMsg)
      ) {
        return false
      }
    }

    return true
  })
}
