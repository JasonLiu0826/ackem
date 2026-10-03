/**
 * P4 · Quote-tolerant search_replace matching (Ackem-owned; behavior aligned to CC spirit).
 */

const CURLY_TO_STRAIGHT: Record<string, string> = {
  '\u201c': '"',
  '\u201d': '"',
  '\u2018': "'",
  '\u2019': "'"
}

export function normalizeQuotes(str: string): string {
  return str.replace(/[\u201c\u201d\u2018\u2019]/g, (ch) => CURLY_TO_STRAIGHT[ch] ?? ch)
}

/** First match: exact needle, else quote-normalized window of same byte length as needle. */
export function findFirstMatchSpan(
  haystack: string,
  needle: string
): { start: number; end: number; actual: string } | null {
  if (!needle) return null
  const exact = haystack.indexOf(needle)
  if (exact !== -1) {
    return { start: exact, end: exact + needle.length, actual: needle }
  }

  const normNeedle = normalizeQuotes(needle)
  const normHay = normalizeQuotes(haystack)
  const normIdx = normHay.indexOf(normNeedle)
  if (normIdx === -1) return null

  const actual = haystack.substring(normIdx, normIdx + needle.length)
  return { start: normIdx, end: normIdx + needle.length, actual }
}

function collapseWhitespaceLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * O2 — when exact/quote match fails: single line where whitespace-collapsed
 * content equals needle (unique only).
 */
export function findWhitespaceCollapsedUniqueLineMatch(
  haystack: string,
  needle: string
): { start: number; end: number; actual: string } | null {
  if (!needle.trim()) return null
  const normNeedle = collapseWhitespaceLine(needle).replace(/;+\s*$/, '')
  if (!normNeedle) return null
  const lines = haystack.split(/\r?\n/)
  let offset = 0
  const hits: Array<{ start: number; end: number; actual: string }> = []
  for (const line of lines) {
    const lineStart = offset
    const lineEnd = offset + line.length
    const normLine = collapseWhitespaceLine(line).replace(/;+\s*$/, '')
    if (normLine === normNeedle) {
      hits.push({ start: lineStart, end: lineEnd, actual: line })
    }
    offset = lineEnd + 1
  }
  if (hits.length !== 1) return null
  return hits[0]!
}

export function findAllMatchSpans(
  haystack: string,
  needle: string
): Array<{ start: number; end: number; actual: string }> {
  const hits: Array<{ start: number; end: number; actual: string }> = []
  let from = 0
  while (from < haystack.length) {
    const slice = haystack.slice(from)
    const m = findFirstMatchSpan(slice, needle)
    if (!m) break
    hits.push({
      start: from + m.start,
      end: from + m.end,
      actual: m.actual
    })
    from = from + m.end
    if (m.end === 0) break
  }
  return hits
}

/** When match used curly quotes in file, map new_string straight quotes to that style. */
export function preserveQuoteStyle(
  actualOld: string,
  oldString: string,
  newString: string
): string {
  if (actualOld === oldString) return newString

  const hasDouble =
    actualOld.includes('\u201c') || actualOld.includes('\u201d')
  const hasSingle =
    actualOld.includes('\u2018') || actualOld.includes('\u2019')
  if (!hasDouble && !hasSingle) return newString

  let out = ''
  let inQuote: '"' | "'" | null = null
  let openStyle: string | null = null

  for (let i = 0; i < newString.length; i++) {
    const ch = newString[i]!
    if (inQuote === '"') {
      if (ch === '"') {
        out += hasDouble ? '\u201d' : '"'
        inQuote = null
        openStyle = null
      } else out += ch
      continue
    }
    if (inQuote === "'") {
      if (ch === "'") {
        out += hasSingle ? '\u2019' : "'"
        inQuote = null
        openStyle = null
      } else out += ch
      continue
    }
    if (ch === '"') {
      inQuote = '"'
      openStyle = '"'
      out += hasDouble ? '\u201c' : '"'
      continue
    }
    if (ch === "'") {
      inQuote = "'"
      openStyle = "'"
      out += hasSingle ? '\u2018' : "'"
      continue
    }
    out += ch
  }
  void openStyle
  return out
}

export function applySingleReplace(
  raw: string,
  span: { start: number; end: number; actual: string },
  oldString: string,
  newString: string
): string {
  const styled = preserveQuoteStyle(span.actual, oldString, newString)
  return raw.slice(0, span.start) + styled + raw.slice(span.end)
}

export function applyReplaceAll(
  raw: string,
  spans: Array<{ start: number; end: number; actual: string }>,
  oldString: string,
  newString: string
): string {
  if (!spans.length) return raw
  let out = ''
  let cursor = 0
  for (const span of spans) {
    out += raw.slice(cursor, span.start)
    out += preserveQuoteStyle(span.actual, oldString, newString)
    cursor = span.end
  }
  out += raw.slice(cursor)
  return out
}
