import type { EvidenceKind } from '../contracts.js'

import {

  isQuestionToCompanion,

  userMsgClaimsSelfBirthday,

  userMsgClaimsSelfName

} from '../userFactGuard.js'



const GREETING_RE = /^(你好|哈喽|嗨|hi|hello|在吗|在不在|早上好|晚上好|谢谢|感谢|嗯|哦|好的)[!！。.\s]*$/iu



/** Work/code requests are not durable user-profile evidence (Plan B / Task 11). */

export function isWorkOrTaskRequest(msg: string): boolean {

  const t = msg.trim()

  if (!t) return false

  return /(?:帮我|请帮|麻烦你|写一?[个份]|实现|运行|执行|部署|修一下|改一下|debug|fix|implement|build)\b/iu.test(t)

}



export function isUserSelfCorrection(msg: string): boolean {

  return /不对|说错|更正|其实|应该是|刚才|不是.*是/u.test(msg.trim())

}



export function isExplicitUserSelfAssertion(msg: string): boolean {

  const t = msg.trim()

  if (!t) return false

  if (userMsgClaimsSelfName(t) || userMsgClaimsSelfBirthday(t)) return true

  if (/我(?:本人)?(?:住在|来自|籍贯)/u.test(t)) return true

  if (/我(?:喜欢|爱|讨厌|偏好|习惯|经常|平时)/u.test(t)) return true

  return false

}



export function classifyChatUserEvidenceKind(userText: string): EvidenceKind {

  const t = userText.trim()

  if (!t) return 'deterministic_rule'

  if (isUserSelfCorrection(t)) return 'user_correction'

  if (isExplicitUserSelfAssertion(t)) return 'user_assertion'

  if (GREETING_RE.test(t)) return 'deterministic_rule'

  if (isQuestionToCompanion(t)) return 'deterministic_rule'

  if (isWorkOrTaskRequest(t)) return 'deterministic_rule'

  return 'deterministic_rule'

}


