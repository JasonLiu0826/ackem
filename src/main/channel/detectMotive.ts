import {
  detectBareFeatureCreateCandidate,
  detectExtensionDemandExplicit,
  extractBareFeatureCreateTopic
} from '../extensions/dispatch/explicitDispatch'
import {
  isCasualOpinionChat,
  isMetaSearchDiscussion,
  wantsOrganizeAsCard
} from '../extensions/plugins/builtin/knowledge-presentation/intent'
import { isWeatherQuery } from '../extensions/skills/builtin/tool/weather-sense/weatherIntent'

export type Motive =
  | { kind: 'none' }
  | { kind: 'organize' }
  | { kind: 'use' }
  | { kind: 'create' }
  | { kind: 'update'; boundName?: string }
  | { kind: 'work'; reason: 'path' | 'persist' | 'folder' }

const READ_KEYWORDS = ['帮我看看', '读一下', '看一下', '看看', '读取', '打开看看']
const WEB_SEARCH_ACTIONS = [
  '帮我搜',
  '帮我查',
  '联网搜',
  '联网查',
  '上网搜',
  '上网查',
  '搜一下',
  '查一下',
  '搜搜',
  '搜一搜',
  '查一查',
  '找找',
  '帮我找',
  '查找'
]

const PATH_RE = /(?:[A-Za-z]:\\|\\\\|~\/|\/[\w. -]+\/)[^\s"'，。！？]*/
const FILE_EXT_RE = /\b[\w.-]+\.(?:md|txt|docx?|xlsx?|pptx?|pdf|json|ts|tsx|js|py|cs)\b/i
const FOLDER_RE = /桌面|下载|Downloads|文件夹|目录/i
const PERSIST_RE = /归档|落盘|写进|写到|存成|放到项目|写成\s*(?:文档|文件|markdown|md|docx|xlsx)/i
const ASK_RE = /会不会|有没有|能不能|可不可以/
const ASK_EXCLUDE_RE = /开始|做个|弄个|做一个|以后能|帮我弄/
const UPDATE_RE = /给它|刚才那个|加个|改成|加上/
const USE_TIME_RE = /倒计时|番茄钟|计时|提醒/
const BACKUP_ACKEM_RE = /备份(?:一下)?\s*Ackem|备份Ackem/i
const SLASH_RE = /^\/[^\s/]{1,32}(?:\s|$)/
const GAP_RE = /要是能.+就好了|如果能.+就好了/
const EPHEMERAL_WRITE_RE = /帮我(?:写|改|润色)|写一句|安慰/

const gapHits = new Map<string, number>()

export function hasLocalWorkSignal(text: string): Motive | null {
  const t = text.trim()
  if (!t) return null
  if (PATH_RE.test(t) || FILE_EXT_RE.test(t) || /\bREADME\b/i.test(t)) {
    return { kind: 'work', reason: 'path' }
  }
  if (READ_KEYWORDS.some((k) => t.includes(k)) && /这个文件|项目里|路径|这个 README|看看这个/i.test(t)) {
    return { kind: 'work', reason: 'path' }
  }
  if (FOLDER_RE.test(t)) return { kind: 'work', reason: 'folder' }
  if (PERSIST_RE.test(t)) return { kind: 'work', reason: 'persist' }
  return null
}

export function isOfficialBackupUtterance(text: string): boolean {
  return BACKUP_ACKEM_RE.test(text)
}

export function extractCwdHint(text: string): string | undefined {
  const path = text.match(PATH_RE)?.[0]
  if (path) return path
  if (/Downloads/i.test(text) || text.includes('下载')) return undefined
  return undefined
}

export function detectMotive(
  text: string,
  recent: Array<{ role: string; content: string }> = [],
  sessionId = 'default'
): Motive {
  const t = text.trim()
  if (!t) return { kind: 'none' }

  const local = hasLocalWorkSignal(t)
  if (local) return local

  if ((ASK_RE.test(t) || /你会.+[吗么]|有没有|会不会/.test(t)) && !ASK_EXCLUDE_RE.test(t)) {
    return { kind: 'none' }
  }

  const bareMake = /(?:做|弄|写)(?:一个|个)|做一个|弄个/.test(t)
  const wantReusable = /我想要一个|想要一个以后|以后可以提醒/.test(t)
  // UPDATE_RE 否定排除 (设计 §9, 阶段 3-1 / J04): 否定/抱怨句不是改版指令。
  const updateNegated =
    /别(?:改|动|加)|不要改|不用改|不(?:要|用)加|怎么不|你怎么不|为什么不/.test(t)
  const wantsUpdate = UPDATE_RE.test(t) && !updateNegated
  if (detectExtensionDemandExplicit(t) || detectBareFeatureCreateCandidate(t) || bareMake || wantReusable) {
    if (wantsUpdate) return { kind: 'update' }
    return { kind: 'create' }
  }
  if (wantsUpdate && extractBareFeatureCreateTopic(t)) {
    return { kind: 'update' }
  }
  if (wantsUpdate && /插件|番茄|倒计时|闹钟/.test(t)) {
    return { kind: 'update' }
  }
  if (wantsUpdate) return { kind: 'update' }

  if (
    SLASH_RE.test(t) ||
    ((
      isWeatherQuery(t) ||
      USE_TIME_RE.test(t) ||
      /开始\s*\d+\s*分钟/.test(t) ||
      /start\s+\d+\s*(?:minutes|minute|min)\b/i.test(t) ||
      /start\s+(?:a\s+)?(?:timer|pomodoro)/i.test(t) ||
      /倒个(?:\s*\d+\s*分钟|钟)|定个时/.test(t) ||
      /give me\s+\d+\s*minutes|set a timer/i.test(t) ||
      /look up\s+\S+/i.test(t) ||
      /ping me in\s*\d+/i.test(t) ||
      isOfficialBackupUtterance(t) ||
      WEB_SEARCH_ACTIONS.some((k) => t.includes(k))
    ) &&
      // 否定/抱怨排除 (设计 §9, J04): 「别提醒我了」「你怎么不提醒我」是抱怨
      // 而非用能指令; 但「能不能别提醒」保留排除链处理。
      !/别(?:提醒|倒计时|计时|搜|查)|不(?:要|用)(?:提醒|倒计时|计时)|怎么不|为什么不/.test(t))
  ) {
    return { kind: 'use' }
  }

  if (wantsOrganizeAsCard(t)) return { kind: 'organize' }

  if (GAP_RE.test(t)) {
    const n = (gapHits.get(sessionId) ?? 0) + 1
    gapHits.set(sessionId, n)
    if (n >= 2 || /帮我弄一个|帮我做/.test(t)) return { kind: 'create' }
    return { kind: 'none' }
  }

  if (
    isCasualOpinionChat(t) ||
    isMetaSearchDiscussion(t) ||
    EPHEMERAL_WRITE_RE.test(t) ||
    t.length <= 4
  ) {
    return { kind: 'none' }
  }

  void recent
  return { kind: 'none' }
}

export function resetGapHits(sessionId?: string): void {
  if (sessionId) gapHits.delete(sessionId)
  else gapHits.clear()
}
