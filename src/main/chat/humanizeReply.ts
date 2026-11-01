// [chat/humanizeReply] — 出站文本人性化：补换气标点、把"一口气长句"拆成多条短消息
// 职责：
//   ① 完全没有标点的长句，在转折词前补一个逗号（读起来有换气）
//   ② 超过软上限且没有句末标点的文本，按 逗号 / 转折词 / 从句起头 的位置拆成多条气泡
//   ③ 代码块、表格、列表、链接等结构化内容原样放过，不插手
// 引用：main/channels/qq/sanitize.ts（同源断句规则）、main/chat/pacedStreamEmitter.ts、
//       main/chat/sentenceBubbleStream.ts、main/channels/weixin/deliveryPlanner.ts
// 纯函数，零 I/O

/** 天然可以作为停顿点的中文连接词（长的排前面，避免被短词抢先匹配） */
export const BREATH_CONNECTORS = [
  '但是',
  '然后',
  '所以',
  '因为',
  '其实',
  '不过',
  '可是',
  '而且',
  '结果',
  '如果',
  '虽然',
  '要不然',
  '只不过',
  '就是',
  // 单字转折词只保留「但」：
  // 「可」会和"可以/可能/可怜"撞车，「而」会和"而已/而是/然而"撞车，
  // 补出来的逗号会把词切开（"想帮你，而已"），比不补更糟。
  '但'
]

/** 超过这个长度还没断句，就算"一口气太长"，该换气或拆条 */
export const RUNON_SOFT_LIMIT = 26

/** 流式切条的"预算"：完全没标点更早断开，已有逗号可以稍微放长 */
export const RUNON_BUDGET_PLAIN = 24
export const RUNON_BUDGET_PUNCTUATED = 34

/** 流式时为了选切点，最多多看几个字 */
export const RUNON_LOOKAHEAD = 16

/** 单句长到这个程度（有标点也算），说明模型又写飞了，必须拆 */
export const RUNON_SENTENCE_CAP = 40

export function runOnBudget(text: string): number {
  return hasBreathPunctuation(text) ? RUNON_BUDGET_PUNCTUATED : RUNON_BUDGET_PLAIN
}

/** 短于这个长度不值得补逗号（会把本来就轻的话弄得很重） */
const BREATH_MIN_LEN = 14

/** 切点太靠前会把一句话切成残片，留一点最小长度 */
const MIN_CUT_INDEX = 6

/** 太短的尾片并回上一条，避免出现"吗"这种单独一条 */
const MIN_TAIL_CHARS = 6

/** 常见从句 / 主语起头，用于找不到转折词时的次优切点 */
const CLAUSE_STARTERS = [
  '我想',
  '我觉得',
  '我是',
  '我就',
  '我们',
  '你还',
  '你就',
  '他还',
  '她还是',
  '然后就',
  '还是',
  '刚才',
  '现在',
  '今天',
  '明天',
  '反正',
  '要不',
  '再说',
  '还有',
  '另外',
  '顺便'
]

const TRAILING_SEPARATORS_RE = /[，,、；;：:\s]+$/u
const SENTENCE_END_RE = /(?<=[。！？!?…])/u
const CLAUSE_END_RE = /(?<=[，,、；;：:])/u
const ANY_BREATH_RE = /[，,、；;。！？!?…]/u

/**
 * 去掉结尾的停顿标点（逗号/顿号/分号/冒号）。
 * 一条消息以「，」收尾会显得话没说完、很突兀，所有出站口在关闭气泡前都要过一遍。
 * 注意：不动 。！？… 这类真正的句末标点。
 */
export function stripTrailingSeparators(text: string): string {
  return text.replace(TRAILING_SEPARATORS_RE, '')
}

/** 文本里是否已经有任何停顿标点 */
export function hasBreathPunctuation(text: string): boolean {
  return ANY_BREATH_RE.test(text)
}

/**
 * 结构化内容守卫：代码 / 表格 / 列表 / 标题 / 链接 / 行内代码。
 * 这些内容自动拆条只会毁掉排版，必须原样放过。
 */
export function looksLikeStructuredContent(text: string): boolean {
  return (
    /```/.test(text) ||
    /^\s{0,3}(?:[-*+]|\d+[.)])\s/mu.test(text) ||
    /^\s{0,3}#{1,6}\s/mu.test(text) ||
    /\|.*\|/u.test(text) ||
    /https?:\/\//iu.test(text) ||
    /`[^`\n]+`/u.test(text)
  )
}

/**
 * 断句守卫：一句话里一个标点都没有时，在第一个转折词前补一个逗号。
 * 只补一次，不反复改写（补多了反而像机器人在加标点）。
 */
export function insertBreathCommas(text: string): string {
  const body = text.trim()
  if (body.length < BREATH_MIN_LEN) return text
  // 代码 / 表格 / 列表 / 链接：一个字都不碰
  if (looksLikeStructuredContent(body)) return text
  // 已经有逗号/顿号/分号，说明她自己断过了，不插手
  if (/[，,、；;]/u.test(body)) return text

  for (const word of BREATH_CONNECTORS) {
    const idx = body.indexOf(word)
    // 不能放在句首（那是另一种句式，不需要逗号）
    if (idx >= MIN_CUT_INDEX) {
      return body.slice(0, idx) + '，' + body.slice(idx)
    }
  }
  return text
}

export type SoftBreak = {
  /** 0 基切点：text.slice(0, index) 是前一条，text.slice(index) 是后一条 */
  index: number
}

function isSurrogateHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isSurrogateLow(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

const ASCII_WORD_RE = /[A-Za-z0-9]/
const DANGEROUS_EDGE_RE = /[*`[\]_~<>|]/u
const LEADING_PUNCT_RE = /[，,。！？!?…、；;：:）)】」』"'”’\s]/u

/** 汉语里常见的小句收尾字，断在这里最自然 */
const CLAUSE_TAIL_RE = /[了啊呢吧吗嘛呀哦诶呢]/u

/** 这个位置切下去会不会切坏东西（代理对、英文单词、Markdown 标记、标点开头） */
function isSafeCut(text: string, index: number): boolean {
  if (index <= MIN_CUT_INDEX) return false
  if (index >= text.length) return false
  const prev = text.charCodeAt(index - 1)
  const next = text.charCodeAt(index)
  if (isSurrogateHigh(prev) || isSurrogateLow(next)) return false
  const prevChar = text[index - 1]!
  const nextChar = text[index]!
  if (LEADING_PUNCT_RE.test(nextChar)) return false
  if (DANGEROUS_EDGE_RE.test(prevChar) || DANGEROUS_EDGE_RE.test(nextChar)) return false
  // 英文单词 / 数字中间不切
  if (ASCII_WORD_RE.test(prevChar) && ASCII_WORD_RE.test(nextChar)) return false
  return true
}

/**
 * 在 limit 附近找一个"读起来能换气"的切点。
 * 优先级：逗号之后 > 转折词之前 > 从句起头之前 > 安全位置硬切。
 * 找不到返回 null（宁可整条发出去，也不切坏句子）。
 */
export function findSoftBreak(text: string, limit = RUNON_SOFT_LIMIT): SoftBreak | null {
  if (text.length < limit) return null
  const maxIndex = Math.min(text.length - 1, limit + 12)
  const window = text.slice(0, maxIndex)

  // ① 逗号之后：句子里已经有停顿，从停顿处断条最自然（前一条保留逗号会显得像没说完，去掉）
  let commaCut = -1
  for (let i = MIN_CUT_INDEX; i < window.length; i++) {
    if (/[，,、；;：:]/u.test(window[i]!)) commaCut = i + 1
  }
  if (commaCut > 0) {
    const trimmed = text.slice(0, commaCut).replace(TRAILING_SEPARATORS_RE, '')
    if (trimmed.length >= MIN_CUT_INDEX) return { index: commaCut }
  }

  // ② 转折词之前
  let connectorCut = -1
  for (const word of BREATH_CONNECTORS) {
    const idx = window.indexOf(word, MIN_CUT_INDEX)
    if (idx > 0 && (connectorCut === -1 || idx < connectorCut)) connectorCut = idx
  }
  if (connectorCut > 0 && isSafeCut(text, connectorCut)) {
    return { index: connectorCut }
  }

  // ③ 从句起头之前（只在 limit 附近找，避免切得太碎）
  const starterFrom = Math.max(MIN_CUT_INDEX, limit - 10)
  for (const word of CLAUSE_STARTERS) {
    const idx = window.indexOf(word, starterFrom)
    if (idx > 0 && isSafeCut(text, idx)) return { index: idx }
  }

  // ④ 分句尾字之后（了啊呢吧吗嘛呀哦诶）：断在这里最像人说话
  const preferredFrom = Math.min(maxIndex, text.length - 1, limit + 4)
  for (let i = preferredFrom; i > MIN_CUT_INDEX; i--) {
    if (CLAUSE_TAIL_RE.test(text[i - 1]!) && isSafeCut(text, i)) {
      return { index: i }
    }
  }

  // ⑤ 安全位置硬切：前一条结尾没有标点，换行成新气泡本身就当断句
  for (let i = preferredFrom; i > MIN_CUT_INDEX; i--) {
    if (isSafeCut(text, i)) return { index: i }
  }

  return null
}

/**
 * 在 fromIndex 之后的一小段里找切点（流式专用）：
 * 标点之后 > 转折词之前 > 分句尾字之后。找不到返回 -1。
 */
export function findBreakAfter(text: string, fromIndex: number, lookahead = 16): number {
  const start = fromIndex + 2
  const end = Math.min(text.length, fromIndex + lookahead)
  if (start >= end) return -1

  for (let i = start; i < end; i++) {
    if (/[，,、；;：:。！？!?…]/u.test(text[i - 1]!)) return i
  }

  for (const word of BREATH_CONNECTORS) {
    const idx = text.indexOf(word, start)
    if (idx > 0 && idx < end) return idx
  }

  for (let i = start; i < end; i++) {
    if (CLAUSE_TAIL_RE.test(text[i - 1]!)) return i
  }

  return -1
}

function splitKeep(text: string, re: RegExp): string[] {
  return text.split(re).map((part) => part.trim()).filter(Boolean)
}

/** 把若干短分句按 maxChars 贪心拼成气泡，绝不超长 */
function packClauses(clauses: string[], maxChars: number): string[] {
  const out: string[] = []
  for (const clause of clauses) {
    const last = out[out.length - 1]
    if (last !== undefined && last.length + clause.length <= maxChars) {
      out[out.length - 1] = last + clause
    } else {
      out.push(clause)
    }
  }
  return out
}

/** 单条分句仍然太长：反复在软切点断开，前一条补逗号 */
function sliceBySoftBreak(text: string, maxChars: number): string[] {
  const out: string[] = []
  let rest = text.trim()

  while (rest.length > maxChars) {
    const soft = findSoftBreak(rest, maxChars)
    if (!soft) break
    const head = rest.slice(0, soft.index).replace(TRAILING_SEPARATORS_RE, '')
    rest = rest.slice(soft.index).trimStart()
    if (head.length < MIN_CUT_INDEX) continue
    out.push(head)
  }
  if (rest) out.push(rest)
  return out.filter(Boolean)
}

/**
 * 把一段回复拆成多条"像真人发消息"的短气泡。
 * 结构化内容（代码/表格/列表/链接）原样返回一条。
 */
export function splitRunOnBubbles(text: string, maxChars = RUNON_SOFT_LIMIT): string[] {
  const body = text.trim()
  if (!body) return []
  if (looksLikeStructuredContent(body)) return [body]

  const out: string[] = []
  for (const sentence of splitKeep(body, SENTENCE_END_RE)) {
    if (sentence.length <= maxChars) {
      out.push(sentence)
      continue
    }
    const clauses = splitKeep(sentence, CLAUSE_END_RE)
    for (const packed of packClauses(clauses, maxChars)) {
      if (packed.length <= maxChars) {
        out.push(insertBreathCommas(packed))
        continue
      }
      out.push(...sliceBySoftBreak(packed, maxChars))
    }
  }

  // 气泡结尾不留逗号（一条消息以逗号收尾看着像话没说完）
  const cleaned = out.map((part) => part.replace(TRAILING_SEPARATORS_RE, '')).filter(Boolean)

  // 太短的尾片（如单个"吗"）并回上一条，别让它单独成为一条消息
  const merged: string[] = []
  for (const part of cleaned) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && part.length <= MIN_TAIL_CHARS && !/[。！？!?…]$/u.test(prev)) {
      merged[merged.length - 1] = prev + part
    } else {
      merged.push(part)
    }
  }
  return merged
}
