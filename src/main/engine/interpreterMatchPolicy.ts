// [interpreterMatchPolicy] — L0 关键词匹配策略（v1.1.0 误伤优化）

/** 子串命中但不应判 hurtful 的组合词 */
export const HURTFUL_FALSE_POSITIVE_PHRASES = [
  '滚烫', '滚水', '滚动', '翻滚', '滚汤', '滚圆', '滚热', '心口滚', '热气滚',
  '滚雪球', '滚落', '滚下来', '滚轮', '滚轴', '滚边', '滚边儿',
]

/** 单字或极短 hurtful 词：需词边界 */
export const HURTFUL_BOUNDARY_WORDS = new Set(['滚', '恨'])

/** 单字 cold 词：需独立短句 */
export const COLD_STANDALONE_WORDS = new Set(['哦', '嗯', 'k', 'ok'])

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** CJK/ASCII 词边界：前后非汉字字母数字则视为边界；单字 hurtful 允许短句内出现 */
export function hasWordBoundary(msg: string, word: string): boolean {
  const trimmed = msg.trim()
  if (trimmed === word) return true

  if (word.length === 1 && /[\u4e00-\u9fff]/.test(word)) {
    if (trimmed.includes(word) && trimmed.length <= 8) return true
  }

  const escaped = escapeRegExp(word)
  const re = new RegExp(
    `(?:^|[^\\u4e00-\\u9fff\\w])${escaped}(?:[^\\u4e00-\\u9fff\\w]|$)`,
    'i'
  )
  return re.test(trimmed)
}

export function isHurtfulFalsePositive(msg: string): boolean {
  return HURTFUL_FALSE_POSITIVE_PHRASES.some((p) => msg.includes(p))
}

export function matchesHurtfulWord(msg: string, word: string): boolean {
  if (isHurtfulFalsePositive(msg)) return false
  const w = word.toLowerCase()
  const m = msg.toLowerCase()
  if (HURTFUL_BOUNDARY_WORDS.has(word) || word.length <= 1) {
    return hasWordBoundary(msg, word)
  }
  if (!m.includes(w)) return false
  return !isHurtfulFalsePositive(msg)
}

export function matchesHurtfulAny(msg: string, words: string[]): boolean {
  return words.some((w) => matchesHurtfulWord(msg, w))
}

export function matchesColdAny(msg: string, words: string[]): boolean {
  const t = msg.trim()
  if (t.length > 20) {
    return words.some((w) => {
      if (!COLD_STANDALONE_WORDS.has(w) && w.length > 2) {
        return hasWordBoundary(t, w)
      }
      return false
    })
  }
  if (t.length <= 20) {
    for (const w of words) {
      if (COLD_STANDALONE_WORDS.has(w)) {
        if (t === w || t === `${w}。` || t === `${w}！` || t === `${w}?` || t === `${w}？`) {
          return true
        }
        if (t.length <= 4 && hasWordBoundary(t, w)) return true
        continue
      }
      if (hasWordBoundary(t, w)) return true
    }
  }
  return false
}

export function matchesPhraseAny(msg: string, words: string[]): boolean {
  const m = msg.toLowerCase()
  return words.some((w) => m.includes(w.toLowerCase()))
}
