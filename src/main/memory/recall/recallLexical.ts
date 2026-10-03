/** Query–corpus relevance for recall ranking (word tokens + Han char bigrams). */

const SPLIT_RE = /[\s，。！？、；：""''（）\[\]{}<>《》,.!?;:'"()\-\u3000]+/

export function tokenizeRecallText(text: string): string[] {
  return text
    .toLowerCase()
    .split(SPLIT_RE)
    .filter((w) => w.length >= 2)
}

/** Continuous Han runs for n-gram extraction (covers unsegmented Chinese). */
export function extractHanRuns(text: string): string[] {
  const runs: string[] = []
  const re = /[\u3400-\u9fff]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[0].length >= 2) runs.push(m[0])
  }
  return runs
}

export function charBigrams(text: string): string[] {
  const out: string[] = []
  for (const run of extractHanRuns(text)) {
    if (run.length === 2) {
      out.push(run)
      continue
    }
    for (let i = 0; i < run.length - 1; i++) {
      out.push(run.slice(i, i + 2))
    }
  }
  return out
}

/**
 * Word overlap (segmented tokens) plus char bigram overlap on Han text.
 * No query-specific branches — same function for all fact kinds.
 */
export function recallTextRelevance(query: string, corpus: string): number {
  const qTokens = new Set(tokenizeRecallText(query))
  if (qTokens.size === 0 && extractHanRuns(query).length === 0) return 0

  let wordHits = 0
  for (const t of tokenizeRecallText(corpus)) {
    if (qTokens.has(t)) wordHits += 1
  }

  const qBg = charBigrams(query)
  if (qBg.length === 0) return wordHits

  const corpusBg = new Set(charBigrams(corpus))
  let bgHits = 0
  for (const bg of qBg) {
    if (corpusBg.has(bg)) bgHits += 1
  }

  return wordHits * 3 + bgHits
}
