export type TurnDedupState = {
  displayedSentences: string[]
}

export function createTurnDedupState(): TurnDedupState {
  return { displayedSentences: [] }
}

/** 纯标点/括号碎片，非语义规则 */
const ORPHAN_ONLY = /^[()（）\[\]【】，,、；;：:…\s]+$/

function normalizeSentence(s: string): string {
  return s
    .trim()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。！？!?….,，、；;：:""''「」『』（）()【】\[\]]+/g, '')
    .toLowerCase()
}

function isSubsumed(a: string, b: string): boolean {
  const na = normalizeSentence(a)
  const nb = normalizeSentence(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen <= 24) {
    return na.includes(nb) || nb.includes(na)
  }
  return false
}

function bigramSimilarity(a: string, b: string): number {
  const na = normalizeSentence(a)
  const nb = normalizeSentence(b)
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0
  const bg = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const sa = bg(na)
  const sb = bg(nb)
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

export type ShouldEmitInput = {
  waveIndex: number
  displayed: string[]
}

export function shouldEmitSentence(sentence: string, input: ShouldEmitInput): boolean {
  const trimmed = sentence.trim()
  if (!trimmed) return false
  if (ORPHAN_ONLY.test(trimmed)) return false

  const { displayed } = input

  for (const prior of displayed) {
    if (isSubsumed(trimmed, prior)) return false
    if (normalizeSentence(trimmed) === normalizeSentence(prior)) return false
    const maxLen = Math.max(trimmed.length, prior.length)
    const threshold = maxLen <= 40 ? 0.68 : 0.55
    if (bigramSimilarity(trimmed, prior) > threshold) {
      return false
    }
  }

  return true
}

export function recordDisplayedSentence(state: TurnDedupState, sentence: string): void {
  const t = sentence.trim()
  if (t) state.displayedSentences.push(t)
}
